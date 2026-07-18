"""합성 hprof를 파싱해 4가지 분석 기능을 검증한다."""

import pytest
import synthetic

from hprof_oom_analyzer import analyzer, parser, report


@pytest.fixture(scope="module")
def snapshot(tmp_path_factory):
  path = tmp_path_factory.mktemp("hprof") / "sample.hprof"
  synthetic.write_sample(path)
  return parser.parse_hprof(path)


def test_histogram_puts_byte_array_first(snapshot):
  stats = analyzer.class_histogram(snapshot)
  assert stats[0].name == "byte[]"
  assert stats[0].count == 2
  assert stats[0].shallow >= synthetic.BIG_ARRAY_LEN + synthetic.SMALL_ARRAY_LEN


def test_retained_approximation(snapshot):
  stats = analyzer.class_histogram(snapshot)
  analyzer.compute_retained(snapshot, stats)
  by_name = {stat.name: stat for stat in stats}
  assert by_name["byte[]"].retained >= synthetic.BIG_ARRAY_LEN + synthetic.SMALL_ARRAY_LEN
  assert by_name["com.example.CacheHolder"].retained >= synthetic.BIG_ARRAY_LEN


def test_large_objects_only_over_1mb(snapshot):
  large = analyzer.find_large_objects(snapshot)
  assert [obj.obj_id for obj in large] == [synthetic.O_BIG_BYTES]


def test_path_to_gc_root(snapshot):
  referrers = analyzer.build_referrers(snapshot)
  steps = analyzer.path_to_gc_root(snapshot, referrers, synthetic.O_BIG_BYTES)
  assert steps is not None
  assert steps[0].ref_name.startswith("GC root")
  assert steps[-1].obj_id == synthetic.O_BIG_BYTES
  assert steps[-1].class_name == "byte[]"


def test_unreachable_object_has_no_path():
  from hprof_oom_analyzer.model import GcRoot, HeapObject, HeapSnapshot

  lone = HeapSnapshot(id_size=8)
  lone.objects[1] = HeapObject(obj_id=1, class_name="Lonely", shallow_size=16)
  lone.roots.append(GcRoot(obj_id=99, kind="unknown"))
  assert analyzer.path_to_gc_root(lone, analyzer.build_referrers(lone), 1) is None


def test_thread_stack(snapshot):
  threads = {thread.name: thread for thread in snapshot.threads}
  assert "main" in threads
  assert threads["main"].frames == ["com.example.CacheHolder.run(CacheHolder.java:42)"]


def test_report_renders(snapshot):
  text = report.render_report(snapshot)
  assert "클래스별 메모리 사용" in text
  assert "byte[]" in text
  assert "GC root" in text
  assert '"main"' in text
