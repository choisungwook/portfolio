package com.example.metaspace;

import java.io.IOException;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.StandardLocation;
import javax.tools.ToolProvider;

public final class MetaspaceOomLab {
  private static final List<ClassLoader> RETAINED_LOADERS = new ArrayList<>();
  private static final List<Class<?>> RETAINED_CLASSES = new ArrayList<>();

  private MetaspaceOomLab() {
  }

  public static void main(String[] args) throws Exception {
    LabConfig config = LabConfig.fromEnv();
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();

    if (compiler == null) {
      throw new IllegalStateException("JDK compiler is required. Run this lab with a JDK image.");
    }

    Files.createDirectories(config.sourceRoot());
    Files.createDirectories(config.classRoot());

    long loadedClassCount = 0;
    while (true) {
      Batch batch = createSourceBatch(config, loadedClassCount);
      compileBatch(compiler, config, batch.sourceFiles());
      loadBatch(config, batch.classNames());
      loadedClassCount += batch.classNames().size();

      System.out.printf(
        Locale.ROOT,
        "loaded_classes=%d retained_class_loaders=%d java_opts=\"%s\"%n",
        loadedClassCount,
        RETAINED_LOADERS.size(),
        env("JAVA_OPTS", "")
      );

      if (config.pauseMillis() > 0) {
        Thread.sleep(config.pauseMillis());
      }
    }
  }

  private static Batch createSourceBatch(LabConfig config, long loadedClassCount) throws IOException {
    List<Path> sourceFiles = new ArrayList<>();
    List<String> classNames = new ArrayList<>();

    for (int index = 0; index < config.batchSize(); index += 1) {
      long classNumber = loadedClassCount + index;
      String simpleName = "Generated" + classNumber;
      String className = "com.example.generated." + simpleName;
      Path sourceFile = config.sourceRoot()
        .resolve("com")
        .resolve("example")
        .resolve("generated")
        .resolve(simpleName + ".java");

      Files.createDirectories(sourceFile.getParent());
      Files.writeString(sourceFile, sourceFor(simpleName, classNumber, config.methodCount()), StandardCharsets.UTF_8);

      sourceFiles.add(sourceFile);
      classNames.add(className);
    }

    return new Batch(sourceFiles, classNames);
  }

  private static String sourceFor(String simpleName, long classNumber, int methodCount) {
    StringBuilder source = new StringBuilder();
    source.append("package com.example.generated;\n\n");
    source.append("public final class ").append(simpleName).append(" {\n");
    source.append("  private final long id = ").append(classNumber).append("L;\n\n");
    source.append("  public long id() {\n");
    source.append("    return id;\n");
    source.append("  }\n\n");

    for (int index = 0; index < methodCount; index += 1) {
      source.append("  public long value").append(index).append("() {\n");
      source.append("    return id + ").append(index).append("L;\n");
      source.append("  }\n\n");
    }

    source.append("}\n");
    return source.toString();
  }

  private static void compileBatch(JavaCompiler compiler, LabConfig config, List<Path> sourceFiles) throws IOException {
    try (StandardJavaFileManager fileManager = compiler.getStandardFileManager(null, Locale.ROOT, StandardCharsets.UTF_8)) {
      fileManager.setLocationFromPaths(StandardLocation.CLASS_OUTPUT, List.of(config.classRoot()));
      Iterable<? extends JavaFileObject> compilationUnits = fileManager.getJavaFileObjectsFromPaths(sourceFiles);
      Boolean success = compiler.getTask(null, fileManager, null, List.of("-g:none"), null, compilationUnits).call();

      if (!Boolean.TRUE.equals(success)) {
        throw new IllegalStateException("Failed to compile generated classes.");
      }
    }
  }

  private static void loadBatch(LabConfig config, List<String> classNames) throws Exception {
    URLClassLoader classLoader = new URLClassLoader(new URL[] {config.classRoot().toUri().toURL()}, null);

    for (String className : classNames) {
      RETAINED_CLASSES.add(Class.forName(className, true, classLoader));
    }

    RETAINED_LOADERS.add(classLoader);
  }

  private record Batch(List<Path> sourceFiles, List<String> classNames) {
  }

  private record LabConfig(Path sourceRoot, Path classRoot, int batchSize, int methodCount, long pauseMillis) {
    static LabConfig fromEnv() {
      Path workDir = Path.of(env("WORK_DIR", "/tmp/metaspace-lab"));

      return new LabConfig(
        workDir.resolve("src"),
        workDir.resolve("classes"),
        readInt("CLASS_BATCH_SIZE", 200),
        readInt("CLASS_METHOD_COUNT", 20),
        readLong("PAUSE_MILLIS", 0)
      );
    }
  }

  private static int readInt(String name, int defaultValue) {
    return Integer.parseInt(env(name, Integer.toString(defaultValue)));
  }

  private static long readLong(String name, long defaultValue) {
    return Long.parseLong(env(name, Long.toString(defaultValue)));
  }

  private static String env(String name, String defaultValue) {
    String value = System.getenv(name);

    if (value == null || value.isBlank()) {
      return defaultValue;
    }

    return value;
  }
}
