"""
TORQ Tracing Exporters
Implements span exporters for various tracing backends
"""

import json
import logging
from typing import List, Dict, Any, Optional
from abc import ABC, abstractmethod
import aiohttp
from .tracing import Span


logger = logging.getLogger(__name__)


class SpanExporter(ABC):
    """Base class for span exporters"""

    @abstractmethod
    def export(self, spans: List[Span]):
        """Export spans to backend"""
        pass


class ConsoleExporter(SpanExporter):
    """
    Export spans to console (for development)

    Outputs formatted span data to logging
    """

    def __init__(self, logger: logging.Logger = None):
        self.logger = logger or logging.getLogger(__name__)

    def export(self, spans: List[Span]):
        """Export spans to console"""
        for span in spans:
            self._log_span(span)

    def _log_span(self, span: Span):
        """Log a single span with formatting"""
        duration = span.duration_ms()
        duration_str = f"{duration:.2f}ms" if duration else "ongoing"

        self.logger.info(
            f"[SPAN] {span.name} ({span.trace_id[:8]}...) "
            f"status={span.status.value} duration={duration_str}"
        )

        if span.attributes:
            for key, value in span.attributes.items():
                self.logger.debug(f"  {key}={value}")

        if span.events:
            for event in span.events:
                self.logger.debug(f"  Event: {event['name']}")


class OTLPExporter(SpanExporter):
    """
    Export spans to OpenTelemetry Protocol (OTLP) collector

    Uses HTTP/JSON to send traces to OTLP endpoint
    """

    def __init__(
        self,
        endpoint: str = "http://localhost:4318/v1/traces",
        headers: Dict[str, str] = None,
        timeout: int = 5,
    ):
        self.endpoint = endpoint
        self.headers = headers or {}
        self.timeout = timeout
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create HTTP session"""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={"Content-Type": "application/json", **self.headers},
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            )
        return self._session

    def export(self, spans: List[Span]):
        """Export spans to OTLP collector"""
        if not spans:
            return

        # Convert spans to OTLP format
        otlp_spans = [self._to_otlp_span(span) for span in spans]

        # Run async export
        import asyncio
        asyncio.create_task(self._export_async(otlp_spans))

    async def _export_async(self, otlp_spans: List[Dict]):
        """Async export to OTLP endpoint"""
        session = await self._get_session()

        try:
            payload = {
                "resource_spans": [
                    {
                        "resource": {
                            "attributes": [
                                {"key": "service.name", "value": {"string_value": "torq-gateway"}},
                                {"key": "service.version", "value": {"string_value": "1.0.0"}},
                            ]
                        },
                        "scope_spans": [
                            {
                                "scope": {"name": "torq"},
                                "spans": otlp_spans,
                            }
                        ],
                    }
                ]
            }

            async with session.post(self.endpoint, json=payload) as response:
                if response.status >= 400:
                    error = await response.text()
                    logger.error(f"OTLP export failed: {response.status} - {error}")
                else:
                    logger.debug(f"Exported {len(otlp_spans)} spans to OTLP")

        except Exception as e:
            logger.error(f"OTLP export error: {e}")

    def _to_otlp_span(self, span: Span) -> Dict[str, Any]:
        """Convert TORQ span to OTLP format"""
        otlp_span = {
            "trace_id": self._bytes_from_hex(span.trace_id),
            "span_id": self._bytes_from_hex(span.span_id),
            "name": span.name,
            "start_time_unix_nano": self._timestamp_nanos(span.start_time),
            "kind": "SPAN_KIND_INTERNAL",
        }

        if span.parent_span_id:
            otlp_span["parent_span_id"] = self._bytes_from_hex(span.parent_span_id)

        if span.end_time:
            otlp_span["end_time_unix_nano"] = self._timestamp_nanos(span.end_time)
            otlp_span["status"] = self._otlp_status(span.status)

        if span.attributes:
            otlp_span["attributes"] = [
                {"key": k, "value": {"string_value": str(v)}}
                for k, v in span.attributes.items()
            ]

        if span.events:
            otlp_span["events"] = [
                {
                    "time_unix_nano": self._timestamp_nanos(
                        datetime.fromisoformat(e["timestamp"])
                    ),
                    "attributes": [
                        {"key": k, "value": {"string_value": str(v)}}
                        for k, v in e.get("attributes", {}).items()
                    ],
                }
                for e in span.events
            ]

        return otlp_span

    @staticmethod
    def _bytes_from_hex(hex_str: str) -> bytes:
        """Convert hex string to bytes"""
        return bytes.fromhex(hex_str.replace("-", ""))

    @staticmethod
    def _timestamp_nanos(dt) -> int:
        """Convert datetime to nanoseconds since Unix epoch"""
        return int(dt.timestamp() * 1e9)

    @staticmethod
    def _otlp_status(status) -> Dict[str, Any]:
        """Convert TORQ status to OTLP status"""
        from .tracing import TraceStatus

        status_map = {
            TraceStatus.HEALTHY: {"status_code": "STATUS_CODE_OK"},
            TraceStatus.COMPLETED: {"status_code": "STATUS_CODE_OK"},
            TraceStatus.ERROR: {"status_code": "STATUS_CODE_ERROR"},
            TraceStatus.DEGRADED: {"status_code": "STATUS_CODE_ERROR"},
            TraceStatus.UNKNOWN: {"status_code": "STATUS_CODE_UNSET"},
        }
        return status_map.get(status, {"status_code": "STATUS_CODE_UNSET"})


class JaegerExporter(SpanExporter):
    """
    Export spans to Jaeger tracing backend

    Uses Jaeger HTTP thrift format
    """

    def __init__(
        self,
        endpoint: str = "http://localhost:14268/api/traces",
        service_name: str = "torq-gateway",
        timeout: int = 5,
    ):
        self.endpoint = endpoint
        self.service_name = service_name
        self.timeout = timeout
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create HTTP session"""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={"Content-Type": "application/json"},
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            )
        return self._session

    def export(self, spans: List[Span]):
        """Export spans to Jaeger"""
        if not spans:
            return

        import asyncio
        asyncio.create_task(self._export_async(spans))

    async def _export_async(self, spans: List[Span]):
        """Async export to Jaeger endpoint"""
        session = await self._get_session()

        try:
            # Convert spans to Jaeger format
            jaeger_spans = [
                {
                    "traceID": span.trace_id.replace("-", ""),
                    "id": span.span_id.replace("-", ""),
                    "name": span.name,
                    "timestamp": int(span.start_time.timestamp() * 1_000_000),  # microseconds
                    "duration": int(span.duration_ms() * 1_000) if span.duration_ms() else 0,
                    "tags": [
                        {"key": k, "type": "string", "value": str(v)}
                        for k, v in span.attributes.items()
                    ],
                }
                for span in spans
                if span.duration_ms() is not None
            ]

            payload = {
                "spans": jaeger_spans,
                "process": {
                    "serviceName": self.service_name,
                    "tags": [{"key": "jaeger.version", "value": "1.0.0"}],
                },
            }

            async with session.post(self.endpoint, json=payload) as response:
                if response.status >= 400:
                    error = await response.text()
                    logger.error(f"Jaeger export failed: {response.status} - {error}")
                else:
                    logger.debug(f"Exported {len(jaeger_spans)} spans to Jaeger")

        except Exception as e:
            logger.error(f"Jaeger export error: {e}")


class PrometheusExporter(SpanExporter):
    """
    Export span metrics to Prometheus

    Exports aggregated metrics rather than individual spans
    """

    def __init__(
        self,
        endpoint: str = "http://localhost:9091/metrics/job/torq",
        timeout: int = 5,
    ):
        self.endpoint = endpoint
        self.timeout = timeout
        self._metrics: Dict[str, Any] = {
            "span_count": 0,
            "error_count": 0,
            "latency_ms_sum": 0,
            "latency_ms_count": 0,
        }

    def export(self, spans: List[Span]):
        """Update metrics from spans"""
        for span in spans:
            self._metrics["span_count"] += 1

            if span.status.value == "error":
                self._metrics["error_count"] += 1

            if span.duration_ms():
                self._metrics["latency_ms_sum"] += span.duration_ms()
                self._metrics["latency_ms_count"] += 1

    def get_metrics(self) -> str:
        """Generate Prometheus metrics format"""
        return f"""
# HELP torq_spans_total Total number of spans
# TYPE torq_spans_total counter
torq_spans_total {self._metrics["span_count"]}

# HELP torq_spans_errors Total number of error spans
# TYPE torq_spans_errors counter
torq_spans_errors {self._metrics["error_count"]}

# HELP torq_span_latency_seconds Span latency in seconds
# TYPE torq_span_latency_seconds histogram
torq_span_latency_seconds_sum {self._metrics["latency_ms_sum"] / 1000}
torq_span_latency_seconds_count {self._metrics["latency_ms_count"]}
"""
