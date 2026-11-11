import type {
  Announcement,
  Book,
  College,
  CollegeProgram,
  District,
  EducationLevel,
  Grade,
  School,
  Subject,
} from '../shared/types';
import { db } from './store';
import { remoteCatalog } from './supabase';

export interface Catalog {
  districts: District[];
  levels: EducationLevel[];
  grades: Grade[];
  schools: School[];
  subjects: Subject[];
  books: Book[];
  colleges: College[];
  programs: CollegeProgram[];
  announcements: Announcement[];
  sources: Record<string, 'supabase' | 'local'>;
}

/** Merged catalog: Supabase rows win when present, local seed fills empty entities. */
export async function getCatalog(): Promise<Catalog> {
  const remote = await remoteCatalog();
  const local: Omit<Catalog, 'sources'> = {
    districts: db.districts,
    levels: db.levels,
    grades: db.grades,
    schools: db.schools,
    subjects: db.subjects,
    books: db.books,
    colleges: db.colleges,
    programs: db.programs,
    announcements: db.announcements,
  };
  if (!remote) {
    return {
      ...local,
      sources: {
        districts: 'local',
        levels: 'local',
        grades: 'local',
        schools: 'local',
        subjects: 'local',
        books: 'local',
        colleges: 'local',
        programs: 'local',
        announcements: 'local',
      },
    };
  }
  const sources: Record<string, 'supabase' | 'local'> = {};
  const merged = { ...local } as Record<string, unknown>;
  (Object.keys(local) as (keyof typeof local)[]).forEach((key) => {
    const remoteRows = (remote as unknown as Record<string, unknown[]>)[key];
    if (Array.isArray(remoteRows) && remoteRows.length > 0) {
      merged[key] = remoteRows;
      sources[key] = 'supabase';
    } else {
      sources[key] = 'local';
    }
  });
  return { ...(merged as unknown as Omit<Catalog, 'sources'>), sources };
}

export function attachDistrictNames(catalog: Catalog) {
  const map = new Map(catalog.districts.map((d) => [d.id, d.name]));
  return catalog.schools.map((school) => ({
    ...school,
    districtName: map.get(school.districtId) ?? '',
  }));
}
