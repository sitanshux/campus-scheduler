import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  X,
  BookOpen,
  Users,
  DoorOpen,
  ClipboardList,
  CalendarCheck,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import type { UserRole, Course, Room, Faculty, BookingRequest } from '../../types';
import { fetchDatasetFull, mapDatasetBookingRequests } from '../../services/api';
import { useApi } from '../../hooks/useApi';

export interface GlobalSearchProps {
  currentRole: UserRole;
  onNavigate: (page: string) => void;
}

type SearchCategory = 'courses' | 'faculty' | 'venues' | 'exams' | 'bookings';

interface SearchResultItem {
  id: string;
  category: SearchCategory;
  categoryLabel: string;
  title: string;
  subtitle: string;
  badge?: string;
  targetPage: string;
}

const CATEGORY_CONFIG: Record<
  SearchCategory,
  {
    label: string;
    icon: typeof BookOpen;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
  }
> = {
  courses: {
    label: 'Courses',
    icon: BookOpen,
    badgeBg: 'bg-[#B9B5F4]/25',
    badgeText: 'text-[#41398C]',
    badgeBorder: 'border-[#B9B5F4]/50',
  },
  faculty: {
    label: 'Faculty',
    icon: Users,
    badgeBg: 'bg-[#B9D9C2]/35',
    badgeText: 'text-[#1B4D2E]',
    badgeBorder: 'border-[#B9D9C2]/60',
  },
  venues: {
    label: 'Venues',
    icon: DoorOpen,
    badgeBg: 'bg-[#B8CDEB]/35',
    badgeText: 'text-[#1E3A5F]',
    badgeBorder: 'border-[#B8CDEB]/60',
  },
  exams: {
    label: 'Examinations',
    icon: ClipboardList,
    badgeBg: 'bg-[#F4DA69]/30',
    badgeText: 'text-[#6B530E]',
    badgeBorder: 'border-[#F4DA69]/50',
  },
  bookings: {
    label: 'Bookings',
    icon: CalendarCheck,
    badgeBg: 'bg-[#E9A8CE]/30',
    badgeText: 'text-[#7D2956]',
    badgeBorder: 'border-[#E9A8CE]/50',
  },
};

const ROOM_TYPE_LABELS: Record<string, string> = {
  auditorium: 'Main Auditorium',
  lecture_hall: 'Lecture Hall',
  classroom: 'Classroom',
  seminar_hall: 'Seminar Hall',
  outdoor: 'Open Air Theatre (OAT)',
  lab_cs: 'Computing Lab',
  lab_elec: 'Electronics Lab',
  lab_phy: 'Physics Lab',
  workshop: 'Central Workshop',
  lab_civil: 'Civil Engineering Lab',
};

function highlightMatch(text: string, query: string) {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark
            key={i}
            className="bg-[#F4DA69]/40 text-[#1E1E1E] font-bold rounded-xs px-0.5"
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

export default function GlobalSearch({ currentRole, onNavigate }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<SearchCategory | 'all'>('all');
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch full dataset using cached api client
  const { data: dataset, loading } = useApi(fetchDatasetFull);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setActiveIndex(-1);
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Allowed categories per role
  const allowedCategories = useMemo<SearchCategory[]>(() => {
    if (currentRole === 'admin') {
      return ['courses', 'faculty', 'venues', 'exams', 'bookings'];
    }
    if (currentRole === 'coordinator' || currentRole === 'faculty') {
      return ['courses', 'faculty', 'venues', 'bookings'];
    }
    if (currentRole === 'club') {
      // Club rep can search venues and their own club bookings
      return ['venues', 'bookings'];
    }
    return ['venues'];
  }, [currentRole]);

  // Target navigation page resolver per role and category
  const resolveTargetPage = useCallback(
    (category: SearchCategory): string => {
      switch (category) {
        case 'courses':
          if (currentRole === 'admin') return 'timetable';
          if (currentRole === 'coordinator') return 'coordinator-timetable';
          if (currentRole === 'faculty') return 'faculty-timetable';
          return 'dashboard';
        case 'faculty':
          if (currentRole === 'admin') return 'faculty';
          if (currentRole === 'coordinator') return 'coordinator-overview';
          if (currentRole === 'faculty') return 'faculty-overview';
          return 'dashboard';
        case 'venues':
          if (currentRole === 'admin') return 'rooms';
          if (currentRole === 'coordinator') return 'coordinator-bookings';
          if (currentRole === 'faculty') return 'faculty-overview';
          if (currentRole === 'club') return 'club-submit';
          return 'dashboard';
        case 'exams':
          return 'exams';
        case 'bookings':
          if (currentRole === 'admin') return 'bookings';
          if (currentRole === 'coordinator') return 'coordinator-bookings';
          if (currentRole === 'faculty') return 'faculty-sessions';
          if (currentRole === 'club') return 'club-requests';
          return 'dashboard';
        default:
          return 'dashboard';
      }
    },
    [currentRole]
  );

  // Build searchable index and perform query
  const searchResults = useMemo<Record<SearchCategory, SearchResultItem[]>>(() => {
    const emptyResult: Record<SearchCategory, SearchResultItem[]> = {
      courses: [],
      faculty: [],
      venues: [],
      exams: [],
      bookings: [],
    };

    if (!dataset || !debouncedQuery) {
      return emptyResult;
    }

    const q = debouncedQuery.toLowerCase();
    const courseMap = new Map((dataset.courses ?? []).map((c: Course) => [c.id, c]));

    // 1. Courses
    if (allowedCategories.includes('courses') && Array.isArray(dataset.courses)) {
      emptyResult.courses = dataset.courses
        .filter(
          (c) =>
            c.id.toLowerCase().includes(q) ||
            c.title.toLowerCase().includes(q) ||
            c.department.toLowerCase().includes(q)
        )
        .slice(0, 6)
        .map((c) => ({
          id: c.id,
          category: 'courses',
          categoryLabel: 'Courses',
          title: `${c.id} ΓÇö ${c.title}`,
          subtitle: `Dept: ${c.department} ΓÇó Year ${c.year} ΓÇó ${c.lecture_hours}L/${c.tutorial_hours}T`,
          badge: c.department,
          targetPage: resolveTargetPage('courses'),
        }));
    }

    // 2. Faculty
    if (allowedCategories.includes('faculty') && Array.isArray(dataset.faculty)) {
      emptyResult.faculty = dataset.faculty
        .filter(
          (f: Faculty) =>
            f.name.toLowerCase().includes(q) ||
            f.id.toLowerCase().includes(q) ||
            f.department.toLowerCase().includes(q)
        )
        .slice(0, 6)
        .map((f) => ({
          id: f.id,
          category: 'faculty',
          categoryLabel: 'Faculty',
          title: f.name,
          subtitle: `Faculty Member ΓÇó Department of ${f.department} ΓÇó ID: ${f.id}`,
          badge: f.department,
          targetPage: resolveTargetPage('faculty'),
        }));
    }

    // 3. Venues
    if (allowedCategories.includes('venues') && Array.isArray(dataset.rooms)) {
      emptyResult.venues = dataset.rooms
        .filter((r: Room) => {
          const typeName = ROOM_TYPE_LABELS[r.type] ?? r.type;
          return (
            r.id.toLowerCase().includes(q) ||
            r.name.toLowerCase().includes(q) ||
            r.building.toLowerCase().includes(q) ||
            typeName.toLowerCase().includes(q)
          );
        })
        .slice(0, 6)
        .map((r) => ({
          id: r.id,
          category: 'venues',
          categoryLabel: 'Venues',
          title: `${r.name} (${r.id})`,
          subtitle: `${ROOM_TYPE_LABELS[r.type] || r.type} ΓÇó Capacity: ${r.capacity} ΓÇó ${r.building}`,
          badge: r.building,
          targetPage: resolveTargetPage('venues'),
        }));
    }

    // 4. Examinations
    if (allowedCategories.includes('exams') && Array.isArray(dataset.exams)) {
      emptyResult.exams = (dataset.exams as Array<{ id: string; course_ids: string[]; size: number }>)
        .filter((e) => {
          const courseTitles = e.course_ids
            .map((cid) => courseMap.get(cid)?.title ?? '')
            .join(' ')
            .toLowerCase();
          return (
            e.id.toLowerCase().includes(q) ||
            e.course_ids.some((cid) => cid.toLowerCase().includes(q)) ||
            courseTitles.includes(q)
          );
        })
        .slice(0, 6)
        .map((e) => {
          const titles = e.course_ids
            .map((cid) => courseMap.get(cid)?.title ?? cid)
            .join(' / ');
          return {
            id: e.id,
            category: 'exams',
            categoryLabel: 'Examinations',
            title: `${e.id} ΓÇö ${titles}`,
            subtitle: `Courses: ${e.course_ids.join(', ')} ΓÇó Size: ${e.size} students`,
            badge: 'Exam',
            targetPage: resolveTargetPage('exams'),
          };
        });
    }

    // 5. Bookings
    if (allowedCategories.includes('bookings') && dataset) {
      const allBookings: BookingRequest[] = mapDatasetBookingRequests(dataset);

      // Visibility filter: Club reps only see club bookings
      const visibleBookings =
        currentRole === 'club'
          ? allBookings.filter(
              (b) =>
                b.role === 'club' ||
                b.category === 'club_event' ||
                b.requestedBy.toLowerCase().includes('club')
            )
          : allBookings;

      emptyResult.bookings = visibleBookings
        .filter(
          (b) =>
            b.id.toLowerCase().includes(q) ||
            b.title.toLowerCase().includes(q) ||
            b.venue.toLowerCase().includes(q) ||
            b.requestedBy.toLowerCase().includes(q)
        )
        .slice(0, 6)
        .map((b) => ({
          id: b.id,
          category: 'bookings',
          categoryLabel: 'Bookings',
          title: b.title,
          subtitle: `${b.venue} ΓÇó Requested by ${b.requestedBy} ΓÇó ${b.timeSlot}`,
          badge: b.status,
          targetPage: resolveTargetPage('bookings'),
        }));
    }

    return emptyResult;
  }, [dataset, debouncedQuery, allowedCategories, currentRole, resolveTargetPage]);

  // Flatten results for keyboard navigation and rendering based on selectedCategory
  const flatResults = useMemo<SearchResultItem[]>(() => {
    const list: SearchResultItem[] = [];
    const categoriesToInclude: SearchCategory[] =
      selectedCategory === 'all'
        ? allowedCategories
        : [selectedCategory];

    for (const cat of categoriesToInclude) {
      if (searchResults[cat]?.length) {
        list.push(...searchResults[cat]);
      }
    }
    return list;
  }, [searchResults, selectedCategory, allowedCategories]);

  const totalResultsCount = flatResults.length;

  const handleSelect = (item: SearchResultItem) => {
    onNavigate(item.targetPage);
    setIsOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || flatResults.length === 0) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % flatResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? flatResults.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && flatResults[activeIndex]) {
        handleSelect(flatResults[activeIndex]);
      } else if (flatResults.length > 0) {
        handleSelect(flatResults[0]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const handleCategoryFilterClick = (cat: SearchCategory) => {
    setSelectedCategory((prev) => (prev === cat ? 'all' : cat));
    inputRef.current?.focus();
    if (query) setIsOpen(true);
  };

  return (
    <div ref={containerRef} className="relative flex-1 max-w-lg">
      {/* Search Bar Input Pill */}
      <div className="flex items-center gap-2 rounded-full bg-[#FFFDF8] border border-[#E8E1D5] py-1 px-1.5 shadow-2xs transition-all focus-within:border-[#E9A8CE] focus-within:ring-2 focus-within:ring-[#E9A8CE]/20">
        <button
          type="button"
          onClick={() => {
            inputRef.current?.focus();
            if (query) setIsOpen(true);
          }}
          className="w-7 h-7 rounded-full bg-[#E9A8CE] text-[#1E1E1E] flex items-center justify-center shrink-0 hover:bg-[#F3C4DF] transition-colors cursor-pointer shadow-xs"
          aria-label="Search"
        >
          {loading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Search size={13} strokeWidth={2.4} />
          )}
        </button>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (query.trim()) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search courses, faculty, venues, bookingsΓÇª"
          className="bg-transparent text-xs font-semibold text-[#1E1E1E] placeholder:text-[#A39E95] focus:outline-none flex-1 min-w-[120px]"
          aria-label="Global search input"
          aria-autocomplete="list"
          aria-expanded={isOpen}
        />

        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="p-1 text-[#A39E95] hover:text-[#1E1E1E] transition-colors cursor-pointer rounded-full"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}

        {/* Category Pill Filters (Intelly Reference Header style: In: [ Courses ] [ Faculty ] [ Venues ]) */}
        <div className="hidden sm:flex items-center gap-1 text-[10px] text-[#75716B] pr-1.5 select-none">
          <span className="font-semibold text-[#A39E95]">In:</span>
          {allowedCategories.slice(0, 3).map((cat) => {
            const isCatSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => handleCategoryFilterClick(cat)}
                className={`border rounded-full px-2 py-0.5 transition-all text-[10px] font-semibold cursor-pointer ${
                  isCatSelected
                    ? 'border-[#E9A8CE] bg-[#E9A8CE]/20 text-[#1E1E1E]'
                    : 'border-dashed border-[#D5CDBD] text-[#75716B] hover:bg-[#F3EDE0]'
                }`}
              >
                {CATEGORY_CONFIG[cat].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search Results Dropdown */}
      {isOpen && debouncedQuery && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl bg-[#FFFDF8] border border-[#E8E1D5] shadow-[0_12px_36px_rgba(0,0,0,0.12)] overflow-hidden">
          {/* Header summary & category filter selector */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#FAF6ED] border-b border-[#E8E1D5] text-xs">
            <span className="font-semibold text-[#75716B]">
              Found <strong className="text-[#1E1E1E] font-bold">{totalResultsCount}</strong> result
              {totalResultsCount !== 1 ? 's' : ''} for &ldquo;{debouncedQuery}&rdquo;
            </span>

            {/* Quick Filter toggle pill */}
            <div className="flex items-center gap-1 overflow-x-auto max-w-[200px] scrollbar-none">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-colors ${
                  selectedCategory === 'all'
                    ? 'bg-[#1E1E1E] text-white'
                    : 'bg-white border border-[#E8E1D5] text-[#75716B] hover:bg-[#F3EDE0]'
                }`}
              >
                All
              </button>
              {allowedCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-colors whitespace-nowrap ${
                    selectedCategory === cat
                      ? 'bg-[#1E1E1E] text-white'
                      : 'bg-white border border-[#E8E1D5] text-[#75716B] hover:bg-[#F3EDE0]'
                  }`}
                >
                  {CATEGORY_CONFIG[cat].label}
                </button>
              ))}
            </div>
          </div>

          {/* Results List */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-[#EFE8DA] p-1">
            {totalResultsCount > 0 ? (
              (() => {
                let runningIndex = -1;
                const categoriesToRender: SearchCategory[] =
                  selectedCategory === 'all' ? allowedCategories : [selectedCategory];

                return categoriesToRender.map((cat) => {
                  const items = searchResults[cat];
                  if (!items || items.length === 0) return null;
                  const config = CATEGORY_CONFIG[cat];
                  const Icon = config.icon;

                  return (
                    <div key={cat} className="p-1">
                      {/* Category Group Header */}
                      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#A39E95]">
                        <Icon size={12} className="text-[#75716B]" />
                        <span>{config.label}</span>
                        <span className="text-[9px] bg-[#FAF6ED] border border-[#E8E1D5] rounded-full px-1.5 py-0.2">
                          {items.length}
                        </span>
                      </div>

                      {/* Items */}
                      <div className="space-y-0.5">
                        {items.map((item) => {
                          runningIndex++;
                          const itemIndex = runningIndex;
                          const isFocused = itemIndex === activeIndex;

                          return (
                            <button
                              key={`${cat}-${item.id}`}
                              type="button"
                              onClick={() => handleSelect(item)}
                              onMouseEnter={() => setActiveIndex(itemIndex)}
                              className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-xl transition-all cursor-pointer ${
                                isFocused
                                  ? 'bg-[#FAF6ED] ring-1 ring-[#E8E1D5]'
                                  : 'hover:bg-[#FAF6ED]/70'
                              }`}
                            >
                              <div className="min-w-0 flex-1 pr-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-[#1E1E1E] truncate">
                                    {highlightMatch(item.title, debouncedQuery)}
                                  </span>
                                  {item.badge && (
                                    <span
                                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${config.badgeBg} ${config.badgeText} ${config.badgeBorder} shrink-0`}
                                    >
                                      {item.badge}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-[#75716B] truncate mt-0.5 font-medium">
                                  {highlightMatch(item.subtitle, debouncedQuery)}
                                </p>
                              </div>

                              <div className="flex items-center gap-1 text-[11px] text-[#A39E95] shrink-0">
                                <span className="text-[10px] font-semibold text-[#75716B] hidden sm:inline">
                                  Open
                                </span>
                                <ChevronRight size={13} />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()
            ) : (
              /* Empty state */
              <div className="px-6 py-10 text-center">
                <div className="w-10 h-10 rounded-2xl bg-[#FAF6ED] border border-[#E8E1D5] mx-auto flex items-center justify-center text-[#A39E95] mb-2 shadow-2xs">
                  <Search size={18} />
                </div>
                <h4 className="text-xs sm:text-sm font-bold text-[#1E1E1E]">
                  No matches for &ldquo;{debouncedQuery}&rdquo;
                </h4>
                <p className="text-[11px] text-[#75716B] mt-1 max-w-xs mx-auto">
                  Try searching with a course code (e.g. CS101), faculty name, room (LH-1), or booking title.
                </p>
              </div>
            )}
          </div>

          {/* Dropdown footer tip */}
          <div className="px-4 py-2 bg-[#FAF6ED] border-t border-[#E8E1D5] flex items-center justify-between text-[10px] text-[#75716B]">
            <span className="hidden sm:inline">
              Use <kbd className="px-1 py-0.5 bg-white border border-[#D5CDBD] rounded-xs font-mono text-[9px]">Γåæ</kbd> <kbd className="px-1 py-0.5 bg-white border border-[#D5CDBD] rounded-xs font-mono text-[9px]">Γåô</kbd> to navigate, <kbd className="px-1 py-0.5 bg-white border border-[#D5CDBD] rounded-xs font-mono text-[9px]">Enter</kbd> to select
            </span>
            <span className="text-[#A39E95] ml-auto">
              Press <kbd className="px-1 py-0.5 bg-white border border-[#D5CDBD] rounded-xs font-mono text-[9px]">Esc</kbd> to dismiss
            </span>
          </div>
        </div>
      )}
    </div>
  );
}