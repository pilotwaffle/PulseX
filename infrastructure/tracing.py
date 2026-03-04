"""
TORQ Distributed Tracing Module
Implements OpenTelemetry tracing for observability

Features:
- Automatic trace propagation
- Span creation for operations
- Integration with popular tracing backends
- Request/response tracing
- Agent operation tracing
"""

import time
import uuid
from typing import Optional, Dict, Any, List, ContextManager
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from enum import Enum
from contextlib import contextmanager
import logging


logger = logging.getLogger(__name__)


class TraceStatus(str, Enum):
    """Trace status values"""
    STARTED = "started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ERROR = "error"
    CANCELLED = "cancelled"


@dataclass
class Span:
    """OpenTelemetry-compatible span"""
    trace_id: str
    span_id: str
    parent_span_id: Optional[str]
    name: str
    start_time: datetime
    end_time: Optional[datetime] = None
    status: TraceStatus = TraceStatus.STARTED
    attributes: Dict[str, Any] = field(default_factory=dict)
    events: List[Dict] = field(default_factory=list)
    links: List[str] = field(default_factory=list)

    def duration_ms(self) -> Optional[float]:
        """Calculate span duration in milliseconds"""
        if self.end_time:
            return (self.end_time - self.start_time).total_seconds() * 1000
        return None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "trace_id": self.trace_id,
            "span_id": self.span_id,
            "parent_span_id": self.parent_span_id,
            "name": self.name,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "status": self.status.value,
            "duration_ms": self.duration_ms(),
            "attributes": self.attributes,
            "events": self.events,
            "links": self.links,
        }


@dataclass
class TraceConfig:
    """Tracing configuration"""
    # Service info
    service_name: str = "torq-gateway"
    service_version: str = "1.0.0"

    # Sampling
    sample_rate: float = 1.0  # 100% sampling

    # Exporter settings
    exporter_type: str = "console"  # console, otlp, jaeger
    exporter_endpoint: Optional[str] = None
    exporter_headers: Dict[str, str] = field(default_factory=dict)

    # Batch settings
    batch_export: bool = True
    batch_size: int = 100
    batch_timeout: int = 5  # seconds

    # Enabled flag
    enabled: bool = True

    # Propagation
    propagate_trace_id: bool = True
    trace_id_header: str = "X-Trace-ID"
    span_context_header: str = "X-Span-Context"


class TracingMiddleware:
    """
    FastAPI middleware for automatic request tracing

    Extracts trace context from headers and creates spans for requests
    """

    def __init__(self, tracer: "Tracer" = None, config: TraceConfig = None):
        self.tracer = tracer
        self.config = config or TraceConfig()

    async def __call__(self, request, call_next):
        """Middleware handler for request tracing"""
        if not self.config.enabled:
            return await call_next(request)

        # Extract trace context
        trace_id = request.headers.get(self.config.trace_id_header) or str(uuid.uuid4())
        parent_span_id = request.headers.get(self.config.span_context_header)

        # Create root span for request
        with self.tracer.start_span(
            name=f"HTTP {request.method}",
            trace_id=trace_id,
            parent_span_id=parent_span_id,
            attributes={
                "http.method": request.method,
                "http.url": str(request.url),
                "http.scheme": request.url.scheme,
                "http.host": request.url.hostname,
                "http.target": request.url.path,
            }
        ) as span:
            # Add trace context to request state
            request.state.trace_id = trace_id
            request.state.span_id = span.span_id
            request.state.span = span

            # Process request
            try:
                response = await call_next(request)

                # Update span with response info
                span.set_attribute("http.status_code", response.status_code)
                if response.status_code >= 400:
                    span.set_status(TraceStatus.ERROR)
                else:
                    span.set_status(TraceStatus.COMPLETED)

                # Add trace headers to response
                if self.config.propagate_trace_id:
                    response.headers[self.config.trace_id_header] = trace_id
                    response.headers[self.config.span_context_header] = span.span_id

                return response

            except Exception as e:
                span.set_status(TraceStatus.ERROR)
                span.add_event("exception", {
                    "exception.type": type(e).__name__,
                    "exception.message": str(e),
                })
                raise


class Tracer:
    """
    OpenTelemetry-compatible tracer

    Creates and manages spans for distributed tracing
    """

    def __init__(self, config: TraceConfig = None):
        self.config = config or TraceConfig()
        self._active_spans: Dict[str, Span] = {}
        self._completed_spans: List[Span] = []
        self._exporters: List["SpanExporter"] = []

        # Initialize exporters
        if self.config.exporter_type == "otlp":
            from tracing_imports import OTLPExporter
            self._exporters.append(OTLPExporter(self.config.exporter_endpoint))
        elif self.config.exporter_type == "jaeger":
            from tracing_imports import JaegerExporter
            self._exporters.append(JaegerExporter(self.config.exporter_endpoint))
        else:
            from tracing_imports import ConsoleExporter
            self._exporters.append(ConsoleExporter())

    def start_span(
        self,
        name: str,
        trace_id: str = None,
        parent_span_id: str = None,
        attributes: Dict[str, Any] = None,
    ) -> "SpanContext":
        """
        Start a new span

        Returns a SpanContext that should be used as a context manager
        """
        if not self.config.enabled:
            return NullSpanContext()

        # Sample if needed
        import random
        if random.random() > self.config.sample_rate:
            return NullSpanContext()

        # Generate IDs
        trace_id = trace_id or str(uuid.uuid4())
        span_id = str(uuid.uuid4())

        # Create span
        span = Span(
            trace_id=trace_id,
            span_id=span_id,
            parent_span_id=parent_span_id,
            name=name,
            start_time=datetime.utcnow(),
            attributes=attributes or {},
        )

        self._active_spans[span_id] = span

        return SpanContext(self, span)

    def end_span(self, span: Span, status: TraceStatus = TraceStatus.COMPLETED):
        """End a span"""
        span.end_time = datetime.utcnow()
        span.status = status

        # Move from active to completed
        if span.span_id in self._active_spans:
            del self._active_spans[span.span_id]
        self._completed_spans.append(span)

        # Export if batch size reached
        if self.config.batch_export and len(self._completed_spans) >= self.config.batch_size:
            self._export_batch()

    def _export_batch(self):
        """Export completed spans"""
        if not self._completed_spans:
            return

        spans = self._completed_spans.copy()
        self._completed_spans.clear()

        for exporter in self._exporters:
            try:
                exporter.export(spans)
            except Exception as e:
                logger.error(f"Span export error: {e}")

    def flush(self):
        """Export all pending spans"""
        if self._completed_spans:
            self._export_batch()


class SpanContext:
    """Context manager for spans"""

    def __init__(self, tracer: Tracer, span: Span):
        self.tracer = tracer
        self.span = span

    def __enter__(self) -> Span:
        return self.span

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.span.set_status(TraceStatus.ERROR)
            self.span.add_event("exception", {
                "exception.type": exc_type.__name__,
                "exception.message": str(exc_val),
            })
        self.tracer.end_span(self.span)

    def set_attribute(self, key: str, value: Any):
        """Set span attribute"""
        self.span.attributes[key] = value

    def add_event(self, name: str, attributes: Dict[str, Any] = None):
        """Add event to span"""
        event = {
            "name": name,
            "timestamp": datetime.utcnow().isoformat(),
            "attributes": attributes or {},
        }
        self.span.events.append(event)

    def set_status(self, status: TraceStatus):
        """Set span status"""
        self.span.status = status

    def record_exception(self, exception: Exception):
        """Record exception in span"""
        self.add_event("exception", {
            "exception.type": type(exception).__name__,
            "exception.message": str(exception),
        })


class NullSpanContext:
    """No-op span context when tracing is disabled"""

    def __enter__(self):
        return None

    def __exit__(self, *args):
        pass


# Span exporters
class SpanExporter:
    """Base class for span exporters"""

    def export(self, spans: List[Span]):
        """Export spans to backend"""
        raise NotImplementedError


class ConsoleExporter(SpanExporter):
    """Export spans to console (for development)"""

    def export(self, spans: List[Span]):
        for span in spans:
            logger.info(f"[TRACE] {span.to_dict()}")


class OTLPExporter(SpanExporter):
    """Export spans to OpenTelemetry collector"""

    def __init__(self, endpoint: str = None):
        self.endpoint = endpoint or "http://localhost:4318"

    def export(self, spans: List[Span]):
        # OTLP export implementation
        # This would use the OTLP protocol to send spans
        pass


class JaegerExporter(SpanExporter):
    """Export spans to Jaeger"""

    def __init__(self, endpoint: str = None):
        self.endpoint = endpoint or "http://localhost:14268/api/traces"

    def export(self, spans: List[Span]):
        # Jaeger export implementation
        pass


# Convenience decorators
def traced(name: str = None, tracer: Tracer = None):
    """Decorator to trace a function"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            _tracer = tracer or get_tracer()
            _name = name or func.__name__

            with _tracer.start_span(_name) as span:
                # Add function attributes
                span.set_attribute("function.name", func.__name__)
                span.set_attribute("function.args", str(args))

                try:
                    result = await func(*args, **kwargs)
                    return result
                except Exception as e:
                    span.record_exception(e)
                    raise

        return wrapper
    return decorator


# Global tracer instance
_default_tracer: Tracer = None


def get_tracer() -> Tracer:
    """Get global tracer instance"""
    global _default_tracer
    if _default_tracer is None:
        _default_tracer = Tracer()
    return _default_tracer


def configure_tracing(config: TraceConfig):
    """Configure global tracer"""
    global _default_tracer
    _default_tracer = Tracer(config)
    return _default_tracer
