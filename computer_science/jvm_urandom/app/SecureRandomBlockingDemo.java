import java.security.SecureRandom;

/**
 * Tomcat session ID 생성과 같은 경로(SHA1PRNG)로 seed를 읽는다.
 * 구버전 커널에서 entropy가 고갈되면 nextBytes의 최초 호출이 /dev/random에서 blocking된다.
 */
public class SecureRandomBlockingDemo {
  public static void main(String[] args) throws Exception {
    System.out.println("java.security.egd = " + System.getProperty("java.security.egd"));

    long start = System.currentTimeMillis();
    SecureRandom random = SecureRandom.getInstance("SHA1PRNG");
    byte[] bytes = new byte[16];
    random.nextBytes(bytes); // 최초 호출에서 securerandom.source로부터 seed를 읽는다
    long elapsed = System.currentTimeMillis() - start;

    System.out.println("seed 확보와 첫 난수 생성까지 " + elapsed + " ms");
  }
}
