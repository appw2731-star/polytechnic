export interface EngineeringStudyTip {
  id: string;
  categoryBn: string;
  categoryEn: string;
  titleBn: string;
  titleEn: string;
  tipBn: string;
  tipEn: string;
  actionHintBn: string;
  actionHintEn: string;
}

export const ENGINEERING_STUDY_TIPS: EngineeringStudyTip[] = [
  {
    id: 'tip-01',
    categoryBn: 'সমস্যা সমাধান',
    categoryEn: 'Problem Solving',
    titleBn: 'সংখ্যা বসানোর আগে একক (Unit) যাচাই করুন',
    titleEn: 'Check Units Before Plugging In Numbers',
    tipBn:
      'পদার্থবিজ্ঞান, সার্কিট বা মেকানিক্সের অঙ্ক করার আগে সব মান SI এককে (যেমন kW থেকে W, cm থেকে m, RPM থেকে rad/s) রূপান্তর করুন। বেশিরভাগ ইঞ্জিনিয়ারিং ভুল সূত্রের নয়, এককের অমিলের কারণে হয়।',
    tipEn:
      'Convert every given value to consistent SI units (kW to W, cm to m, RPM to rad/s) before substituting into formulas. Most calculation errors in engineering exams come from unit mismatches rather than wrong formulas.',
    actionHintBn: 'উত্তরের শেষে একক ও তাৎপর্যপূর্ণ অঙ্ক মিলিয়ে নিন।',
    actionHintEn: 'Verify dimensional balance on your final answer.',
  },
  {
    id: 'tip-02',
    categoryBn: 'ডায়াগ্রাম ও স্কেচ',
    categoryEn: 'Diagrams & Sketches',
    titleBn: 'প্রতিটি সমস্যার জন্য পরিষ্কার স্কেচ আঁকুন',
    titleEn: 'Sketch Free-Body & Circuit Diagrams First',
    tipBn:
      'সার্কিট অ্যানালাইসিস, বিম লোডিং বা থার্মোডায়নামিক্সের অঙ্ক সরাসরি সমীকরণ দিয়ে শুরু করবেন না। ৩০ সেকেন্ড ব্যয় করে ফ্রি-বডি বা সার্কিট ডায়াগ্রাম আঁকলে চিহ্ন (+/−) ও দিকনির্দেশের ভুল প্রায় শূন্যে নেমে আসে।',
    tipEn:
      'Never jump straight to equations in circuit analysis, mechanics, or thermodynamics. Spending 30 seconds on a labeled free-body or circuit diagram eliminates nearly all sign and direction mistakes.',
    actionHintBn: 'পরিচিত মান ও অজানা রাশি ডায়াগ্রামের পাশেই লিখে রাখুন।',
    actionHintEn: 'Label knowns and unknowns right on the sketch.',
  },
  {
    id: 'tip-03',
    categoryBn: 'সূত্র আয়ত্ত',
    categoryEn: 'Formula Mastery',
    titleBn: 'সূত্র মুখস্থ নয়, মূল সম্পর্ক থেকে বের করুন',
    titleEn: 'Derive Formulas From First Principles',
    tipBn:
      'একটি অধ্যায়ের ২০টি সূত্র আলাদা করে মুখস্থ না করে ২-৩টি মূল সূত্র (যেমন ওহমের সূত্র, নিউটনের সূত্র, শক্তির নিত্যতা) বুঝে নিন। পরীক্ষার হলে চাপ থাকলেও মূল সম্পর্ক থেকে বাকি সূত্র সহজেই বের করা যায়।',
    tipEn:
      'Instead of memorizing twenty derived equations per chapter, anchor on two or three governing laws (Ohm’s law, Newton’s laws, conservation of energy) and practice deriving the rest in two lines.',
    actionHintBn: 'সপ্তাহে একবার বই না দেখে মূল সূত্রগুলো কাগজে লিখুন।',
    actionHintEn: 'Recreate core derivations from memory once a week.',
  },
  {
    id: 'tip-04',
    categoryBn: 'ল্যাব ও প্র্যাকটিক্যাল',
    categoryEn: 'Lab & Practicals',
    titleBn: 'ল্যাবের তত্ত্ব ও রিডিং একই দিনে গুছিয়ে নিন',
    titleEn: 'Connect Lab Readings to Theory the Same Day',
    tipBn:
      'প্র্যাকটিক্যাল ক্লাস শেষ হওয়ার ২৪ ঘণ্টার মধ্যেই ল্যাবের রিডিং, গ্রাফ ও ত্রুটির কারণগুলো লিখে রাখুন। তত্ত্বের সাথে যন্ত্রপাতির বাস্তব আচরণ মেলাতে পারলে ভাইভা ও বোর্ড পরীক্ষায় উত্তর দেওয়া অনেক সহজ হয়।',
    tipEn:
      'Review your lab observations, error margins, and plots within 24 hours of class. Linking measured values to textbook theory builds deep intuition for both practical vivas and written board exams.',
    actionHintBn: 'প্রতিটি এক্সপেরিমেন্টের পাশে ১টি বাস্তব প্রয়োগ নোট করুন।',
    actionHintEn: 'Jot down one real industrial application per lab.',
  },
  {
    id: 'tip-05',
    categoryBn: 'সময় ব্যবস্থাপনা',
    categoryEn: 'Focus Technique',
    titleBn: 'ম্যাথ ও ডিজাইনে ৫০/১০ ফোকাস ব্লক ব্যবহার করুন',
    titleEn: 'Use 50/10 Deep-Work Blocks for Technical Subjects',
    tipBn:
      'জটিল গণিত, কোডিং বা ড্রয়িংয়ের জন্য ২৫ মিনিট অনেক সময় কম হয়ে যায়। ৫০ মিনিট সম্পূর্ণ মনোযোগে কাজ করে ১০ মিনিট বিরতি নিলে গভীর সমস্যা সমাধানে প্রবাহ (flow) বজায় থাকে।',
    tipEn:
      'For multi-step math, CAD drawings, or programming, 50 minutes of uninterrupted work followed by a 10-minute screen-free break gives your brain enough runway to solve complex problems cleanly.',
    actionHintBn: 'স্টাডি টাইমারে একটি ৫০ মিনিটের সেশন চালু করে দেখুন।',
    actionHintEn: 'Try a 50-minute block in the Study Timer today.',
  },
  {
    id: 'tip-06',
    categoryBn: 'পরীক্ষার প্রস্তুতি',
    categoryEn: 'Exam Strategy',
    titleBn: 'নিজস্ব "ভুলের খাতা" (Error Log) তৈরি করুন',
    titleEn: 'Maintain a Personal Error Log',
    tipBn:
      'মডেল টেস্ট বা অনুশীলনে যেসব অঙ্ক বা MCQ ভুল হয়, সেগুলো আলাদা খাতায় কারণসহ লিখে রাখুন। পরীক্ষার আগের রাতে পুরো বই পড়ার চেয়ে এই ভুলের খাতা রিভিশন দিলে নম্বর দ্রুত বাড়ে।',
    tipEn:
      'Record every tricky problem or MCQ you miss along with the exact reason you missed it. Reviewing your error log before exams delivers far higher score gains than passively re-reading chapters.',
    actionHintBn: 'প্রতিটি ভুলের পাশে "কীভাবে ঠিক করলাম" এক লাইনে লিখুন।',
    actionHintEn: 'Add a one-line fix note beside every logged mistake.',
  },
  {
    id: 'tip-07',
    categoryBn: 'স্মৃতি ও রিভিশন',
    categoryEn: 'Active Recall',
    titleBn: 'বই বন্ধ করে ৩ মিনিটে অধ্যায় ব্যাখ্যা করুন',
    titleEn: 'Use the 3-Minute Feynman Check',
    tipBn:
      'কোনো টপিক (যেমন ট্রান্সফরমার লস বা কার্নো সাইকেল) পড়া শেষে বই বন্ধ করে সহজ ভাষায় নিজে নিজেকে বোঝান। যেখানে আটকে যাবেন, ঠিক সেই অংশটিই আবার পড়তে হবে।',
    tipEn:
      'After studying a concept like transformer losses or Carnot cycles, close your notes and explain it aloud in plain terms. Any spot where you hesitate shows the exact gap to revisit.',
    actionHintBn: 'বন্ধুদের সাথে গ্রুপ স্টাডিতে একে অপরকে ১টি করে টপিক বোঝান।',
    actionHintEn: 'Teach one concept to a classmate after each lecture.',
  },
  {
    id: 'tip-08',
    categoryBn: 'বোর্ড পরীক্ষা',
    categoryEn: 'BTEB Board Prep',
    titleBn: 'বিগত ৫ বছরের বোর্ড প্রশ্ন ধরন অনুযায়ী ভাগ করুন',
    titleEn: 'Cluster Past Board Questions by Pattern',
    tipBn:
      'বিগত বোর্ড প্রশ্নগুলো শুধু সাল অনুযায়ী না পড়ে অধ্যায় ও ধরন অনুযায়ী সাজান। এতে সহজেই বুঝতে পারবেন কোন অধ্যায় থেকে অঙ্ক, কোনটি থেকে সংক্ষিপ্ত প্রশ্ন এবং কোনটি থেকে চিত্র আসে।',
    tipEn:
      'Group the last five years of board questions by chapter and question type rather than by year. Patterns in recurring numericals, short proofs, and neat diagrams become immediately obvious.',
    actionHintBn: 'সর্বাধিক আসা ৩টি অধ্যায় আগে সম্পূর্ণ শেষ করুন।',
    actionHintEn: 'Master the top three high-weight chapters first.',
  },
  {
    id: 'tip-09',
    categoryBn: 'নোট নেওয়া',
    categoryEn: 'Note-Taking',
    titleBn: 'প্রতি অধ্যায়ের শেষে ১ পৃষ্ঠার ফর্মুলা শিট বানান',
    titleEn: 'Build a One-Page Chapter Summary Sheet',
    tipBn:
      'একটি অধ্যায় শেষ হওয়ার সাথে সাথে তার সব প্রতীক (Symbol), একক, মূল সূত্র ও বিশেষ শর্ত এক পৃষ্ঠায় গুছিয়ে লিখুন। সেমিস্টার ফাইনালের সময় দ্রুত রিভিশনে এটি অমূল্য সম্পদ হয়ে ওঠে।',
    tipEn:
      'Summarize every completed chapter onto a single page with symbols, SI units, core equations, and boundary conditions. By finals week, you will have a crisp, custom revision handbook.',
    actionHintBn: 'সংরক্ষিত নোটস সেকশনে অধ্যায়ের সারাংশ যোগ করে রাখুন।',
    actionHintEn: 'Save your chapter summary inside the Notes section.',
  },
  {
    id: 'tip-10',
    categoryBn: 'প্রোগ্রামিং ও লজিক',
    categoryEn: 'Coding & Logic',
    titleBn: 'কোড লেখার আগে খাতায় ফ্লোচার্ট বা ধাপ লিখুন',
    titleEn: 'Trace Logic on Paper Before Writing Code',
    tipBn:
      'C, Python বা মাইক্রোকন্ট্রোলার প্রোগ্রামিংয়ের সময় সরাসরি টাইপ না করে আগে ইনপুট, শর্ত ও লুপের ধাপগুলো খাতায় ট্রেস করুন। এতে লজিক ভুল দ্রুত ধরা পড়ে এবং ডিবাগিং সময় অর্ধেক কমে।',
    tipEn:
      'Before typing C, Python, or microcontroller code, dry-run your inputs, branches, and loop counters on paper. Catching edge cases early cuts debugging time in half.',
    actionHintBn: 'ছোট একটি টেস্ট ইনপুট দিয়ে হাতে-কলমে আউটপুট মিলিয়ে নিন।',
    actionHintEn: 'Dry-run with one small sample input before compiling.',
  },
  {
    id: 'tip-11',
    categoryBn: 'গণনা দক্ষতা',
    categoryEn: 'Calculation Habits',
    titleBn: 'ক্যালকুলেটর চাপার আগে আনুমানিক মান ভাবুন',
    titleEn: 'Sanity-Check Answers With Quick Estimates',
    tipBn:
      'সায়েন্টিফিক ক্যালকুলেটরে মান বসানোর আগেই উত্তরটি মোটামুটি কত হতে পারে তা মনে মনে অনুমান করুন। দক্ষতা (Efficiency) ১০০%-এর বেশি বা কারেন্ট অস্বাভাবিক বড় এলে সাথে সাথেই ভুল বুঝতে পারবেন।',
    tipEn:
      'Estimate the order of magnitude before hitting equals on your scientific calculator. Spotting impossible results—like efficiency over 100% or negative resistance—saves critical exam marks.',
    actionHintBn: 'ডিগ্রি (DEG) না রেডিয়ান (RAD) মোড চালু আছে তা পরীক্ষা করুন।',
    actionHintEn: 'Double-check DEG vs. RAD mode before trig calculations.',
  },
  {
    id: 'tip-12',
    categoryBn: 'ধারাবাহিকতা',
    categoryEn: 'Spaced Repetition',
    titleBn: '১-৩-৭ দিনের ব্যবধানে কঠিন টপিক রিভিশন দিন',
    titleEn: 'Review Tough Topics on a 1–3–7 Day Rhythm',
    tipBn:
      'নতুন কোনো কঠিন বিষয় পড়ার পরদিন, ৩ দিন পর এবং ৭ দিন পর মাত্র ১০ মিনিট করে চোখ বুলিয়ে নিন। এই স্পেসড রিপিটিশন পদ্ধতি তথ্যকে স্বল্পমেয়াদি থেকে দীর্ঘমেয়াদি স্মৃতিতে স্থায়ী করে।',
    tipEn:
      'Revisit newly learned technical material after 1 day, 3 days, and 7 days for just 10 minutes each time. Spaced intervals lock definitions, pinouts, and equations into long-term memory.',
    actionHintBn: 'আজ পড়া কঠিন টপিকটি ৩ দিন পরের রুটিনে যুক্ত করুন।',
    actionHintEn: 'Schedule a 10-minute review task three days out.',
  },
  {
    id: 'tip-13',
    categoryBn: 'ইঞ্জিনিয়ারিং ড্রয়িং',
    categoryEn: 'Technical Drawing',
    titleBn: 'অর্থোগ্রাফিক প্রজেকশনে তিনটি ভিউ একসাথে কল্পনা করুন',
    titleEn: 'Visualize All Three Orthographic Views Together',
    tipBn:
      'টপ, ফ্রন্ট ও সাইড ভিউ আঁকার আগে বস্তুটির হিডেন এজ ও সেন্টার লাইনগুলো চিহ্নিত করুন। প্রজেকশন লাইন হালকা রেখে মূল আউটলাইন স্পষ্ট করলে ড্রয়িংয়ে সর্বোচ্চ নম্বর পাওয়া সহজ হয়।',
    tipEn:
      'Before darkening outlines in engineering drawing, trace hidden edges and centerlines lightly across front, top, and side views. Clean line-weight hierarchy earns top practical marks.',
    actionHintBn: 'ফার্স্ট-অ্যাঙ্গেল ও থার্ড-অ্যাঙ্গেল প্রজেকশন প্রতীক যাচাই করুন।',
    actionHintEn: 'Confirm whether the problem specifies 1st or 3rd angle.',
  },
  {
    id: 'tip-14',
    categoryBn: 'পাওয়ার ও ইলেকট্রিক্যাল',
    categoryEn: 'Power & Circuits',
    titleBn: 'ফেজর ডায়াগ্রাম দিয়ে AC সার্কিট বুঝুন',
    titleEn: 'Read AC Circuits Through Phasor Diagrams',
    tipBn:
      'AC সার্কিটে ভোল্টেজ ও কারেন্টের লিড-ল্যাগ সম্পর্ক এবং পাওয়ার ফ্যাক্টর বোঝার সবচেয়ে সহজ উপায় হলো ফেজর ডায়াগ্রাম আঁকা। এতে ইনডাকটিভ ও ক্যাপাসিটিভ আচরণ এক নজরে পরিষ্কার হয়ে যায়।',
    tipEn:
      'Drawing a quick phasor diagram makes voltage-current phase angles, reactive power, and power-factor correction immediately intuitive instead of a tangle of trig identities.',
    actionHintBn: 'রেফারেন্স ফেজর হিসেবে সিরিজ সার্কিটে কারেন্ট ও প্যারালালে ভোল্টেজ ধরুন।',
    actionHintEn: 'Use current as reference in series and voltage in parallel.',
  },
  {
    id: 'tip-15',
    categoryBn: 'ক্লাস প্রস্তুতি',
    categoryEn: 'Lecture Readiness',
    titleBn: 'ক্লাসের আগে অধ্যায়ের শিরোনামগুলো ১০ মিনিট দেখুন',
    titleEn: 'Preview Chapter Headings for 10 Minutes Before Class',
    tipBn:
      'ক্লাসে যাওয়ার আগে আগামী লেকচারের টপিক ও নতুন শব্দগুলোতে মাত্র ১০ মিনিট চোখ বুলিয়ে নিন। মস্তিষ্ক আগে থেকে কাঠামোটা চেনা থাকলে শিক্ষকের ব্যাখ্যা দ্বিগুণ দ্রুত বোঝা যায়।',
    tipEn:
      'Skim section headings, diagrams, and key terms for 10 minutes before a lecture. Priming your brain with the chapter roadmap lets you absorb live explanations twice as effectively.',
    actionHintBn: 'না বোঝা ১টি প্রশ্ন আগে থেকে নোট করে ক্লাসে নিয়ে যান।',
    actionHintEn: 'Bring one question to ask during or after class.',
  },
  {
    id: 'tip-16',
    categoryBn: 'কঠিন অঙ্ক',
    categoryEn: 'Worked Examples',
    titleBn: 'উদাহরণ দেখে পড়ার বদলে ঢেকে সমাধান করুন',
    titleEn: 'Cover the Solution When Studying Worked Examples',
    tipBn:
      'বইয়ের সমাধান করা অঙ্ক শুধু পড়ে গেলে মনে হয় সব সহজ, কিন্তু পরীক্ষার হলে লেখা আটকে যায়। সমাধানটা হাত দিয়ে ঢেকে নিজে চেষ্টা করুন—আটকে গেলে শুধু পরের লাইনটি দেখে আবার চেষ্টা চালিয়ে যান।',
    tipEn:
      'Reading solved examples creates an illusion of mastery. Cover the steps, attempt the next line yourself, and only peek one line at a time when genuinely stuck.',
    actionHintBn: 'আজকের অধ্যায় থেকে অন্তত ২টি উদাহরণ না দেখে সমাধান করুন।',
    actionHintEn: 'Solve two worked examples today with the steps covered.',
  },
  {
    id: 'tip-17',
    categoryBn: 'পরীক্ষা কৌশল',
    categoryEn: 'Exam Execution',
    titleBn: 'সহজ ও নিশ্চিত প্রশ্নগুলো দিয়ে লেখা শুরু করুন',
    titleEn: 'Lock In High-Confidence Questions First',
    tipBn:
      'পরীক্ষার হলে প্রথম ১৫ মিনিটে যেসব প্রশ্ন ও অঙ্ক সবচেয়ে ভালো জানা আছে সেগুলো গুছিয়ে সমাধান করুন। এতে আত্মবিশ্বাস বাড়ে এবং কঠিন প্রশ্ন ভাবার সময় মস্তিষ্ক শান্ত থাকে।',
    tipEn:
      'Scan the exam paper first and complete the problems you know best. Banking early marks lowers stress and frees working memory for the toughest multi-part problems.',
    actionHintBn: 'প্রতিটি বড় প্রশ্নের জন্য ঘড়ি দেখে সময় ভাগ করে নিন।',
    actionHintEn: 'Budget minutes per question proportional to its marks.',
  },
  {
    id: 'tip-18',
    categoryBn: 'স্বাস্থ্য ও ঘুম',
    categoryEn: 'Memory Consolidation',
    titleBn: 'পরীক্ষার আগের রাতে পুরো রাত জাগবেন না',
    titleEn: 'Protect Sleep Before Technical Exams',
    tipBn:
      'ঘুমের সময়ই মস্তিষ্ক সারাদিনের শেখা সূত্র ও সমস্যা সমাধানের ধাপগুলো সাজিয়ে রাখে। অন্তত ৬.৫–৭ ঘণ্টা ঘুমালে পরীক্ষার হলে হিসাবের ভুল ও মনোযোগের ঘাটতি অনেক কমে যায়।',
    tipEn:
      'Your brain consolidates formulas and procedural steps during deep sleep. Getting 6.5–7 hours before an exam prevents careless arithmetic slips and keeps analytical recall sharp.',
    actionHintBn: 'রাত জাগার বদলে বিকেলে ৩০ মিনিট দ্রুত রিভিশন শেষ করুন।',
    actionHintEn: 'Wrap up final review early rather than pulling an all-nighter.',
  },
];

export function getRandomStudyTip(excludeId?: string): EngineeringStudyTip {
  const pool =
    excludeId && ENGINEERING_STUDY_TIPS.length > 1
      ? ENGINEERING_STUDY_TIPS.filter((tip) => tip.id !== excludeId)
      : ENGINEERING_STUDY_TIPS;
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex] ?? ENGINEERING_STUDY_TIPS[0];
}
