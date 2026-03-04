"""
Fixed ConsoleExporter for standalone tracing
"""
from typing import List
from tracing import Span

class ConsoleExporter:
    """Export spans to console (for development)"""
    def export(self, spans: List[Span]):
        for span in spans:
            print(f"[TRACE] {span.to_dict()}")
