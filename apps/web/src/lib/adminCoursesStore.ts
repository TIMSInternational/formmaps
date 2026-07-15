import { Course } from "@/types/course";

const STORE: Course[] = [];

export function seedFromMock(courses: Course[]) {
  // clone into the store
  STORE.length = 0;
  for (const c of courses) STORE.push({ ...c });
}

export function getAllAdminCourses() {
  return STORE;
}

export function getAdminCourse(id: string) {
  return STORE.find((c) => c.id === id) ?? null;
}

export function createAdminCourse(payload: Course) {
  const id = `course_${Date.now()}`;
  const created = { ...payload, id } as Course;
  STORE.push(created);
  return created;
}

export function updateAdminCourse(id: string, payload: Partial<Course>) {
  const idx = STORE.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  STORE[idx] = { ...STORE[idx], ...payload } as Course;
  return STORE[idx];
}

export function deleteAdminCourse(id: string) {
  const idx = STORE.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  STORE.splice(idx, 1);
  return true;
}

export function toggleActiveCourse(id: string) {
  const idx = STORE.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  STORE[idx].isActive = !STORE[idx].isActive;
  return STORE[idx];
}
