"""Tkinter 기반 GUI.

파일을 열면 백그라운드 스레드에서 파싱과 분석을 돌리고,
탭 4개(히스토그램, 큰 객체, GC root 경로, 스레드 스택)에 결과를 채운다.
"""

from __future__ import annotations

import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from . import analyzer, report
from .model import HeapObject, HeapSnapshot
from .parser import HprofParseError, parse_hprof

HISTOGRAM_ROW_LIMIT = 200
PATH_TAB_INDEX = 2


class AnalyzerApp:
  """메인 윈도우."""

  def __init__(self, root: tk.Tk) -> None:
    self.root = root
    self.snapshot: HeapSnapshot | None = None
    self.referrers: dict[int, list[tuple[int, str]]] = {}
    root.title("hprof OOM analyzer")
    root.geometry("1100x700")
    self._build_toolbar()
    self._build_tabs()

  def load(self, path: str) -> None:
    """파일 파싱과 분석을 백그라운드 스레드에서 시작한다."""
    self.status.set(f"분석 중... {path}")
    threading.Thread(target=self._analyze, args=(path,), daemon=True).start()

  def _build_toolbar(self) -> None:
    bar = ttk.Frame(self.root, padding=4)
    bar.pack(fill="x")
    ttk.Button(bar, text="hprof 열기", command=self._choose_file).pack(side="left")
    self.status = tk.StringVar(value="hprof 파일을 열어 분석을 시작한다.")
    ttk.Label(bar, textvariable=self.status, padding=(8, 0)).pack(side="left")

  def _build_tabs(self) -> None:
    self.tabs = ttk.Notebook(self.root)
    self.tabs.pack(fill="both", expand=True)
    self.histogram = self._make_tree(
      "클래스별 히스토그램", ("class", "count", "shallow", "retained(근사)"),
    )
    self.large = self._make_tree("1MB 이상 객체", ("object id", "class", "shallow"))
    self.path_text = self._make_text("GC root 경로")
    self.thread_text = self._make_text("스레드 스택")
    self.histogram.bind("<Double-1>", self._on_histogram_pick)
    self.large.bind("<Double-1>", self._on_large_pick)

  def _make_tree(self, title: str, columns: tuple[str, ...]) -> ttk.Treeview:
    frame = ttk.Frame(self.tabs)
    self.tabs.add(frame, text=title)
    tree = ttk.Treeview(frame, columns=columns, show="headings")
    for column in columns:
      tree.heading(column, text=column)
      tree.column(column, width=200, anchor="w")
    scroll = ttk.Scrollbar(frame, orient="vertical", command=tree.yview)
    tree.configure(yscrollcommand=scroll.set)
    scroll.pack(side="right", fill="y")
    tree.pack(fill="both", expand=True)
    return tree

  def _make_text(self, title: str) -> tk.Text:
    frame = ttk.Frame(self.tabs)
    self.tabs.add(frame, text=title)
    text = tk.Text(frame, wrap="none", font=("Courier", 11))
    scroll = ttk.Scrollbar(frame, orient="vertical", command=text.yview)
    text.configure(yscrollcommand=scroll.set)
    scroll.pack(side="right", fill="y")
    text.pack(fill="both", expand=True)
    return text

  def _choose_file(self) -> None:
    path = filedialog.askopenfilename(filetypes=[("hprof", "*.hprof"), ("모든 파일", "*.*")])
    if path:
      self.load(path)

  def _analyze(self, path: str) -> None:
    try:
      snapshot = parse_hprof(path)
      stats = analyzer.class_histogram(snapshot)
      analyzer.compute_retained(snapshot, stats)
      large = analyzer.find_large_objects(snapshot)
      referrers = analyzer.build_referrers(snapshot)
    except (HprofParseError, OSError, MemoryError) as error:
      self.root.after(0, self._show_error, str(error))
      return
    self.root.after(0, self._show_result, path, snapshot, stats, large, referrers)

  def _show_error(self, message: str) -> None:
    self.status.set("분석 실패")
    messagebox.showerror("hprof 분석 실패", message)

  def _show_result(self, path, snapshot, stats, large, referrers) -> None:
    self.snapshot = snapshot
    self.referrers = referrers
    self._fill_histogram(stats)
    self._fill_large(large)
    self._fill_threads(snapshot)
    self.status.set(
      f"{path} — 객체 {len(snapshot.objects):,}개, GC root {len(snapshot.roots):,}개"
    )

  def _fill_histogram(self, stats: list[analyzer.ClassStat]) -> None:
    self.histogram.delete(*self.histogram.get_children())
    for stat in stats[:HISTOGRAM_ROW_LIMIT]:
      retained = report.format_size(stat.retained) if stat.retained is not None else "-"
      values = (stat.name, f"{stat.count:,}", report.format_size(stat.shallow), retained)
      self.histogram.insert("", "end", values=values)

  def _fill_large(self, large: list[HeapObject]) -> None:
    self.large.delete(*self.large.get_children())
    for obj in large:
      values = (f"0x{obj.obj_id:x}", obj.class_name, report.format_size(obj.shallow_size))
      self.large.insert("", "end", values=values)

  def _fill_threads(self, snapshot: HeapSnapshot) -> None:
    self.thread_text.delete("1.0", "end")
    self.thread_text.insert("1.0", report.render_threads(snapshot))

  def _on_histogram_pick(self, _event) -> None:
    item = self.histogram.focus()
    if not item or self.snapshot is None:
      return
    class_name = self.histogram.item(item, "values")[0]
    target = analyzer.largest_instance_of(self.snapshot, class_name)
    if target:
      self._show_path(target)

  def _on_large_pick(self, _event) -> None:
    item = self.large.focus()
    if not item or self.snapshot is None:
      return
    obj_id = int(self.large.item(item, "values")[0], 16)
    target = self.snapshot.objects.get(obj_id)
    if target:
      self._show_path(target)

  def _show_path(self, target: HeapObject) -> None:
    steps = analyzer.path_to_gc_root(self.snapshot, self.referrers, target.obj_id)
    header = f"[{target.class_name} 0x{target.obj_id:x}, {report.format_size(target.shallow_size)}]"
    self.path_text.delete("1.0", "end")
    self.path_text.insert("1.0", "\n".join([header, *report.render_path(steps)]))
    self.tabs.select(PATH_TAB_INDEX)


def run_gui(path: str | None = None) -> None:
  """GUI를 띄운다. path가 있으면 바로 분석을 시작한다."""
  root = tk.Tk()
  app = AnalyzerApp(root)
  if path:
    app.load(path)
  root.mainloop()
