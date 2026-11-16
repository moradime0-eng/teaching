# Models Documentation

## Section & Lecture Architecture Decision

### Current Implementation: Embedded Sub-documents

**Sections** and **Lectures** are stored as **embedded sub-documents** within the **Course** model (`Course.ts`).

#### Why Embedded?

1. **Performance**: Single query fetches course with all sections and lectures
2. **Data Consistency**: Sections/lectures always belong to a course - no orphaned documents
3. **Simplicity**: No need for complex population or separate CRUD operations
4. **Typical Size**: Courses typically have < 50 sections, well within MongoDB's 16MB document limit
5. **Atomic Updates**: Course + sections/lectures updated in single transaction

#### Structure

```typescript
// In Course.ts
sections: [
  {
    title: String,
    description: String,
    order: Number,
    lectures: [
      {
        title: String,
        type: LectureType, // video, article, quiz, download, live
        duration: Number,
        isFreePreview: Boolean,
        content: String, // For article type
        videoUrl: String, // For video type
        fileUrl: String, // For download type
        order: Number,
      },
    ],
  },
];
```

### Legacy Models (Preserved for Future Use)

The following models exist but are **not currently used** in active routes:

- `Section.ts` - Separate Section model with tenant isolation
- `Lecture.ts` - Separate Lecture model with tenant isolation
- `sectionRoutes.ts` - Commented out in `routes/index.ts`
- `lectureRoutes.ts` - Commented out in `routes/index.ts`
- `sectionController.ts` - Preserved for future independent section management
- `lectureController.ts` - Preserved for future independent lecture management

### When to Switch to Separate Models?

Consider migrating to separate models if:
- Sections exceed 100+ per course regularly
- Need independent section/lecture permissions
- Need to share sections across courses
- Document size approaches 16MB limit
- Complex querying on sections/lectures across courses needed

### Migration Path

If migration needed:
1. Create migration script to extract embedded sections to separate collection
2. Uncomment routes in `routes/index.ts`
3. Update controllers to use separate models
4. Update frontend services to use new endpoints
5. Add proper indexes for cross-course queries

---

## Category Model

Categories support **hierarchical structure** (2 levels max):
- Level 0: Root categories (e.g., "برنامه‌نویسی")
- Level 1: Subcategories (e.g., "فرانت‌اند", "بک‌اند")

Virtual fields:

- `children` - Populated subcategories
- `fullPath` - Full path string (e.g., "برنامه‌نویسی > فرانت‌اند > Angular")

Pre-save middleware automatically sets `level` based on parent.
