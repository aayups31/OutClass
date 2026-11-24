import { rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  describeLearningPage,
  isCurriculumLesson,
  learningUrl,
  webLearningId,
} from "../src/learning-source";
import { Application } from "../src/server/application";
import { CourseLibrary } from "../src/server/library";
import { Store } from "../src/server/store";

describe("web lessons", () => {
  it.each([
    [
      "https://leetcode.com/problems/two-sum/description/",
      "LeetCode",
      "leetcode:practice",
    ],
    [
      "https://www.youtube.com/watch?v=abcdefghijk&list=PLexample",
      "YouTube",
      "youtube:playlist:PLexample",
    ],
    [
      "https://www.freecodecamp.org/learn/2022/responsive-web-design/cat-photo-app/step-1",
      "freeCodeCamp",
      "freecodecamp:2022/responsive-web-design",
    ],
    [
      "https://www.codecademy.com/courses/learn-javascript/lessons/intro/exercises/console",
      "Codecademy",
      "codecademy:learn-javascript",
    ],
    [
      "https://www.boot.dev/lessons/example",
      "Boot.dev",
      "https://www.boot.dev",
    ],
    [
      "https://coddy.tech/learn/python/fundamentals/the_language",
      "Coddy",
      "Coddy:python",
    ],
  ])("classifies %s", (link, provider, group) => {
    const url = learningUrl(link)!;
    expect(describeLearningPage(url)).toMatchObject({ provider, group });
    expect(isCurriculumLesson(url)).toBe(true);
  });

  it("strips unrelated query data and rejects non-public URLs", () => {
    expect(
      learningUrl(
        "https://youtube.com/watch?v=abcdefghijk&list=PLabc&token=secret#next",
      )?.href,
    ).toBe("https://youtube.com/watch?v=abcdefghijk&list=PLabc");
    expect(
      learningUrl("https://example.org/course/unit?email=private#link")?.href,
    ).toBe("https://example.org/course/unit");
    for (const link of [
      "file:///data",
      "http://example.org/",
      "https://127.0.0.1/",
      "https://browser.local/",
      "https://user:secret@example.org/",
    ])
      expect(learningUrl(link)).toBeNull();
  });

  it("keeps lesson URLs distinct and includes saved captures in OffCourse retrieval", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "outclass-web-"));
    const store = new Store(directory);
    try {
      const app = new Application(store);
      await app.setup(path.join(directory, "history"), false);
      const library = new CourseLibrary(app);
      const urls = [
        "https://docs.example.org/python/values?private=hidden",
        "https://docs.example.org/python/collections",
      ];
      const group = describeLearningPage(learningUrl(urls[0])!).group;
      const courseId = await webLearningId("course", group);
      const lessons = await Promise.all(
        urls.map(async (url, order) => ({
          id: await webLearningId(
            "lesson",
            describeLearningPage(learningUrl(url)!).lessonKey,
          ),
          url,
          title: order ? "Collections" : "Values",
          order,
          section: "Python",
        })),
      );
      app.observe({
        eventId: "web-fixture",
        title: "Python docs",
        courseId,
        url: urls[0],
        lessons,
        currentLessonId: lessons[0].id,
      });
      app.observe({
        eventId: "web-fixture-recapture",
        title: "Suggested title",
        preserveTitle: true,
        courseId,
        url: urls[1],
        lessons: [lessons[1]],
        currentLessonId: lessons[1].id,
      });
      const content = "A dictionary associates each distinct key with a value.";
      library.document(
        courseId,
        "Collections",
        content,
        "web-page",
        lessons[1].id,
      );
      expect(store.state().courses).toMatchObject([
        {
          platform: "web",
          title: "Python docs",
          currentLessonId: lessons[1].id,
          lessons: [
            { url: "https://docs.example.org/python/values" },
            { url: urls[1] },
          ],
        },
      ]);
      expect(library.lessonMaterial(courseId, lessons[0].id)).toBeNull();
      expect(library.lessonMaterial(courseId, lessons[1].id)).toMatchObject({
        content,
      });
      expect(
        await library.retrieve(courseId, "dictionary", lessons[1].id, true),
      ).toEqual([
        expect.objectContaining({
          kind: "web-page",
          lessonId: lessons[1].id,
          text: content,
        }),
      ]);
    } finally {
      store.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
