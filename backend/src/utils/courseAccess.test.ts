import Course from '../models/Course';
import Enrollment from '../models/Enrollment';
import { courseAccess, visibleLecture } from './courseAccess';
import { isExactOrder } from './orderValidation';

jest.mock('../models/Course', () => ({ __esModule: true, default: { findById: jest.fn() } }));
jest.mock('../models/Enrollment', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
const courseFind = Course.findById as jest.Mock;
const enrollFind = Enrollment.findOne as jest.Mock;
const req = (id?: string, role = 'student') => ({ user: id ? { _id: id, role } : undefined } as any);
const course = (status = 'published', isFree = false) => ({ status, isFree, instructor: 'owner', coInstructors: ['co'] });

beforeEach(() => {
  jest.clearAllMocks();
  courseFind.mockReturnValue({ select: jest.fn().mockResolvedValue(course()) });
  enrollFind.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
});

test('anonymous and unregistered students receive only metadata; previews remain visible', async () => {
  const access = await courseAccess(req(), 'course');
  const lecture = { _id: 'a', title: 'title', richTextContent: 'secret', contentItems: [{ richTextContent: 'secret' }] };
  expect(visibleLecture(lecture, access)).not.toHaveProperty('contentItems');
  expect(visibleLecture({ ...lecture, isFreePreview: true }, access)).toHaveProperty('contentItems');
  expect((await courseAccess(req('student'), 'course')).canViewContent).toBe(false);
});
test('enrollment query excludes refunds and expired access', async () => {
  enrollFind.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: 'enrollment' }) });
  expect((await courseAccess(req('student'), 'course')).canViewContent).toBe(true);
  expect(enrollFind.mock.calls[0][0]).toMatchObject({ isRefunded: false, student: 'student', course: 'course' });
  expect(enrollFind.mock.calls[0][0].$or).toHaveLength(3);
});
test.each(['owner', 'co'])('course manager %s can inspect draft', async (id) => {
  courseFind.mockReturnValue({ select: jest.fn().mockResolvedValue(course('draft')) });
  expect((await courseAccess(req(id, 'instructor'), 'course')).manager).toBe(true);
});
test('admin can inspect draft but unrelated instructor and student cannot', async () => {
  courseFind.mockReturnValue({ select: jest.fn().mockResolvedValue(course('draft')) });
  expect((await courseAccess(req('admin', 'admin'), 'course')).manager).toBe(true);
  await expect(courseAccess(req('other', 'instructor'), 'course')).rejects.toMatchObject({ statusCode: 404 });
  await expect(courseAccess(req('student'), 'course')).rejects.toMatchObject({ statusCode: 404 });
});
test('unpublished lectures are hidden from students even if enrolled', () => {
  expect(visibleLecture({ isPublished: false, isFreePreview: true }, { manager: false, canViewContent: true })).toBeNull();
  expect(visibleLecture({ isPublished: false }, { manager: true, canViewContent: true })).not.toBeNull();
});
test('free published courses preserve public content access', async () => {
  courseFind.mockReturnValue({ select: jest.fn().mockResolvedValue(course('published', true)) });
  expect((await courseAccess(req(), 'course')).canViewContent).toBe(true);
});
test('reorder accepts only a complete, unique permutation', () => {
  expect(isExactOrder(['b', 'a'], ['a', 'b'])).toBe(true);
  expect(isExactOrder(['a'], ['a', 'b'])).toBe(false);
  expect(isExactOrder(['a', 'a'], ['a', 'b'])).toBe(false);
  expect(isExactOrder(['a', 'c'], ['a', 'b'])).toBe(false);
});
