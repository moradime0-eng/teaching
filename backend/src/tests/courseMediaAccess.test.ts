import express from 'express';
import { Readable } from 'stream';
import request from 'supertest';
import Course from '../models/Course';
import Lecture from '../models/Lecture';
import Enrollment from '../models/Enrollment';
import storage from '../services/storageService';
import { streamLectureVideo, serveFile } from '../controllers/uploadController';
import { errorHandler } from '../middlewares/errorHandler';

jest.mock('../models/Course', () => ({ __esModule: true, default: { findById: jest.fn() } }));
jest.mock('../models/Lecture', () => ({ __esModule: true, default: { findById: jest.fn() } }));
jest.mock('../models/Enrollment', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../services/storageService', () => ({ __esModule: true, default: { getFileInfo: jest.fn(), getVideoStream: jest.fn() } }));
const app = express();
app.use((req: any, _res, next) => { if (req.headers['x-user']) req.user = { _id: req.headers['x-user'], role: req.headers['x-role'] || 'student' }; next(); });
app.all('/video/:lectureId', streamLectureVideo);
app.get('/file/:lectureId', serveFile);
app.use(errorHandler);
let status = 'published';
let isPublished = true;
let isFreePreview = false;
let enrolled = false;
beforeEach(() => {
  jest.clearAllMocks(); status = 'published'; isPublished = true; isFreePreview = false; enrolled = false;
  (Course.findById as jest.Mock).mockImplementation(() => ({ select: async () => ({ status, isFree: false, instructor: 'owner', coInstructors: [] }) }));
  (Lecture.findById as jest.Mock).mockImplementation(async () => ({ course: 'course', isPublished, isFreePreview, storage: { key: 'private/video.mp4' }, fileUrl: 'private/file.pdf', contentItems: [] }));
  (Enrollment.findOne as jest.Mock).mockImplementation(() => ({ select: async () => enrolled ? { _id: 'enrollment' } : null }));
  (storage.getFileInfo as jest.Mock).mockResolvedValue({ size: 4, contentType: 'application/pdf' });
  (storage.getVideoStream as jest.Mock).mockImplementation(async () => ({ stream: Readable.from(Buffer.from('data')), contentLength: 4, totalSize: 4 }));
});
test('anonymous and unregistered students cannot stream private video or download file', async () => {
  expect((await request(app).head('/video/lecture')).status).toBe(401);
  expect((await request(app).get('/file/lecture')).status).toBe(401);
  expect((await request(app).head('/video/lecture').set('x-user', 'student')).status).toBe(403);
  expect((await request(app).get('/file/lecture').set('x-user', 'student')).status).toBe(403);
  expect(storage.getFileInfo).not.toHaveBeenCalled();
});
test('enrolled student can stream while responses cannot be cached publicly', async () => {
  enrolled = true;
  const result = await request(app).head('/video/lecture').set('x-user', 'student');
  expect(result.status).toBe(200);
  expect(result.headers['cache-control']).toBe('private, no-store');
});
test('preview is inaccessible for unpublished course or unpublished lecture', async () => {
  isFreePreview = true; status = 'draft';
  expect((await request(app).head('/video/lecture')).status).toBe(404);
  status = 'published'; isPublished = false;
  expect((await request(app).head('/video/lecture')).status).toBe(404);
  expect((await request(app).get('/file/lecture')).status).toBe(404);
});
test('owner and admin can access draft, another instructor cannot', async () => {
  status = 'draft';
  expect((await request(app).head('/video/lecture').set('x-user', 'owner').set('x-role', 'instructor')).status).toBe(200);
  expect((await request(app).head('/video/lecture').set('x-user', 'admin').set('x-role', 'admin')).status).toBe(200);
  expect((await request(app).head('/video/lecture').set('x-user', 'other').set('x-role', 'instructor')).status).toBe(404);
});

test('enrolled student receives mocked private video and attachment bytes without shared caching', async () => {
  enrolled = true;
  const video = await request(app).get('/video/lecture').set('x-user', 'student');
  expect(video.status).toBe(200);
  expect(video.body.toString()).toBe('data');
  expect(video.headers['cache-control']).toBe('private, no-store');
  const file = await request(app).get('/file/lecture').set('x-user', 'student');
  expect(file.status).toBe(200);
  expect(file.body.toString()).toBe('data');
  expect(file.headers['cache-control']).toBe('private, no-store');
});

test('unknown content item never falls back to another video or file', async () => {
  enrolled = true;
  expect((await request(app).get('/video/lecture?resourceId=unknown').set('x-user', 'student')).status).toBe(404);
  expect((await request(app).get('/file/lecture?resourceId=unknown').set('x-user', 'student')).status).toBe(404);
  expect(storage.getVideoStream).not.toHaveBeenCalled();
});
