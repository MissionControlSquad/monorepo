"use client";

/**
 * Example usage of MarkdownComment component
 * This shows how to use the component to render agent comments
 */

import { MarkdownComment, InlineMarkdown } from "./MarkdownComment";

export function MarkdownCommentExamples() {
  // Example 1: Agent's progress update
  const progressUpdate = `## 🔍 Research Phase Complete

I've finished the research phase for this task.

**Key Accomplishments:**
- ✅ Gathered relevant information
- ✅ Identified key sources
- ✅ Documented findings

**Deliverables:**
- Research report available in Documents section

> Moving forward with next steps!`;

  // Example 2: Final completion comment
  const completionComment = `# 🎉 Work Complete - Ready for Review

I've successfully completed all assigned work on this task!

---

## ✅ Completed Tasks

- ✅ 📋 Review task: Create blog post
- ✅ 🎯 Define content outline
- ✅ ✍️ Write first draft
- ✅ 🔄 Review and revise
- ✅ ✅ Finalize and submit

---

### 📄 Documents Created

- **Draft: Blog Post** (deliverable)
- **Content Outline** (deliverable)

---

## 📋 Summary

All work items have been finished and are ready for your review. I've created **2 documents** with detailed deliverables.

**Status:** ✅ Complete
**Ready For:** Review & Approval

**CC:** @Commander Kia Hayes

---

> 💬 Feel free to reach out if you have any questions or need revisions!`;

  // Example 3: Simple status update
  const statusUpdate = `## 💬 Progress Update

Work is progressing smoothly!

**Current Status:**
- Making steady progress
- On track with timeline
- No blockers at this time

> Will continue with remaining tasks!`;

  return (
    <div className="examples-container" style={{ padding: "20px", maxWidth: "800px" }}>
      <h1>Markdown Comment Examples</h1>

      <section>
        <h2>Example 1: Progress Update</h2>
        <MarkdownComment
          content={progressUpdate}
          author="Nova Quinn"
          timestamp={Date.now() - 3600000}
        />
      </section>

      <section>
        <h2>Example 2: Completion Comment</h2>
        <MarkdownComment
          content={completionComment}
          author="Aria Delacroix"
          timestamp={Date.now()}
        />
      </section>

      <section>
        <h2>Example 3: Status Update</h2>
        <MarkdownComment
          content={statusUpdate}
          author="Nova Quinn"
          timestamp={Date.now() - 1800000}
        />
      </section>

      <section>
        <h2>Example 4: Inline Markdown (No Container)</h2>
        <InlineMarkdown content="This is **inline markdown** with _formatting_ and `code`!" />
      </section>
    </div>
  );
}

/**
 * Usage in Task Comments Section
 */
export function TaskCommentsExample() {
  // This is how you'd use it in your actual task comments component

  // Assuming you have messages from GraphQL
  const messages = [
    {
      _id: "1",
      fromProfileId: "profile-1",
      fromProfile: { displayName: "Nova Quinn" },
      content: "## 📋 Task Review Complete\n\nI've reviewed the requirements and ready to start!",
      createdAt: Date.now() - 7200000,
    },
    {
      _id: "2",
      fromProfileId: "profile-1",
      fromProfile: { displayName: "Nova Quinn" },
      content: "## ✅ Work Complete\n\nAll tasks finished! Documents are ready for review.",
      createdAt: Date.now(),
    },
  ];

  return (
    <div className="task-comments">
      {messages.map((message) => (
        <MarkdownComment
          key={message._id}
          content={message.content}
          author={message.fromProfile.displayName}
          timestamp={message.createdAt}
        />
      ))}
    </div>
  );
}
