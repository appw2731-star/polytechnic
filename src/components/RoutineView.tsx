import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  Plus,
  Trash2,
} from 'lucide-react';
import { DAYS_OF_WEEK, getSubjectsForUser, getTodayDayBn } from '../data/curriculum';
import { DayOfWeek, DepartmentId, SemesterNumber, StudyTask } from '../types/study';
import { toBnDigits } from '../utils/formatBn';

interface RoutineViewProps {
  tasks: StudyTask[];
  department: DepartmentId;
  semester: SemesterNumber;
  onAddTask: (task: Omit<StudyTask, 'id' | 'createdAt' | 'completed'>) => void;
  onToggleTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onClearCompleted: () => void;
}

function calcDurationMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) return 60;
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : 45;
}

export const RoutineView: React.FC<RoutineViewProps> = ({
  tasks,
  department,
  semester,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onClearCompleted,
}) => {
  const todayBn = getTodayDayBn();
  const [selectedDay, setSelectedDay] = useState<DayOfWeek | 'সব'>(todayBn);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'done'>('all');

  const semesterSubjects = useMemo(
    () => getSubjectsForUser(department, semester),
    [department, semester]
  );

  const [title, setTitle] = useState('');
  const [subjectName, setSubjectName] = useState(
    semesterSubjects[0]?.nameBn ?? 'সাধারণ অধ্যয়ন'
  );
  const [day, setDay] = useState<DayOfWeek>(todayBn);
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('19:00');
  const [priority, setPriority] = useState<'উচ্চ' | 'মধ্যম' | 'সাধারণ'>('মধ্যম');

  useEffect(() => {
    if (semesterSubjects.length > 0) {
      setSubjectName(semesterSubjects[0].nameBn);
    }
  }, [semesterSubjects]);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((t) => (selectedDay === 'সব' ? true : t.day === selectedDay))
      .filter((t) => {
        if (statusFilter === 'pending') return !t.completed;
        if (statusFilter === 'done') return t.completed;
        return true;
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [tasks, selectedDay, statusFilter]);

  const completedTotal = tasks.filter((t) => t.completed).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const matchedSubj = semesterSubjects.find((s) => s.nameBn === subjectName);
    onAddTask({
      title: title.trim(),
      subjectName: subjectName.trim() || 'সাধারণ অধ্যয়ন',
      subjectCode: matchedSubj?.code,
      day,
      startTime,
      endTime,
      durationMinutes: calcDurationMinutes(startTime, endTime),
      priority,
    });
    setTitle('');
    setSelectedDay(day);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
            দৈনিক স্টাডি রুটিন
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            সপ্তাহের প্রতিটি দিনের পড়ার সময়সূচি সাজান এবং সম্পন্ন কাজ চিহ্নিত করুন
          </p>
        </div>

        {completedTotal > 0 && (
          <button
            type="button"
            onClick={onClearCompleted}
            className="min-h-[40px] self-start sm:self-auto px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            সম্পন্ন টাস্ক মুছুন ({toBnDigits(completedTotal)})
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Add Task Form */}
        <section className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            নতুন স্টাডি টাস্ক যোগ করুন
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                কাজের বিবরণ
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="যেমন: অধ্যায় ৩-এর অঙ্ক অনুশীলন"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                বিষয় নির্বাচন
              </label>
              <select
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                {semesterSubjects.map((subj) => (
                  <option key={subj.id} value={subj.nameBn}>
                    {subj.code} — {subj.nameBn}
                  </option>
                ))}
                <option value="সাধারণ অধ্যয়ন ও রিভিশন">সাধারণ অধ্যয়ন ও রিভিশন</option>
                <option value="ল্যাব ও প্র্যাকটিক্যাল প্রস্তুতি">ল্যাব ও প্র্যাকটিক্যাল প্রস্তুতি</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  বার
                </label>
                <select
                  value={day}
                  onChange={(e) => setDay(e.target.value as DayOfWeek)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  অগ্রাধিকার
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as 'উচ্চ' | 'মধ্যম' | 'সাধারণ')}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="উচ্চ">উচ্চ</option>
                  <option value="মধ্যম">মধ্যম</option>
                  <option value="সাধারণ">সাধারণ</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  শুরুর সময়
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  শেষ সময়
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>রুটিনে যোগ করুন</span>
            </button>
          </form>
        </section>

        {/* Task List */}
        <section className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedDay('সব')}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  selectedDay === 'সব'
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                সব দিন
              </button>
              {DAYS_OF_WEEK.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDay(d)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    selectedDay === d
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {d === todayBn ? `${d} (আজ)` : d}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900">
                {(
                  [
                    { id: 'all', label: 'সবগুলো' },
                    { id: 'pending', label: 'বাকি' },
                    { id: 'done', label: 'সম্পন্ন' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      statusFilter === tab.id
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {toBnDigits(filteredTasks.length)}টি টাস্ক
              </span>
            </div>
          </div>

          {filteredTasks.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                এই ফিল্টারে কোনো স্টাডি টাস্ক পাওয়া যায়নি।
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                বাম পাশের ফর্ম ব্যবহার করে নতুন অধ্যয়ন পরিকল্পনা যোগ করুন।
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredTasks.map((task) => (
                <li
                  key={task.id}
                  className="px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/35 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onToggleTask(task.id)}
                    className="flex-1 min-h-[44px] flex items-start gap-3 text-left min-w-0"
                  >
                    <span className="mt-0.5 shrink-0">
                      {task.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-semibold ${
                          task.completed
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {task.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                        <span>{task.day}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Clock className="w-3 h-3" />
                          {task.startTime}–{task.endTime} ({toBnDigits(task.durationMinutes)} মি.)
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{task.subjectName}</span>
                        <span aria-hidden="true">·</span>
                        <span>অগ্রাধিকার: {task.priority}</span>
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteTask(task.id)}
                    aria-label="টাস্ক মুছুন"
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
