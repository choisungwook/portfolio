import java.util.ArrayList;
import java.util.List;

/**
 * 메모리 누수를 재현하는 앱.
 * static 컬렉션은 GC가 회수하지 못하므로 heap이 가득 찰 때까지 계속 쌓인다.
 */
public class LeakApp {
  static final List<byte[]> CACHE = new ArrayList<>();

  public static void main(String[] args) throws InterruptedException {
    System.out.println("pid: " + ProcessHandle.current().pid());
    while (true) {
      CACHE.add(new byte[1024 * 1024]); // 1MiB씩 누적
      if (CACHE.size() % 16 == 0) {
        System.out.println("leaked: " + CACHE.size() + " MiB");
      }
      Thread.sleep(10);
    }
  }
}
