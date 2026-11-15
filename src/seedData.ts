import { Project, DailyReport, IssueReport, ProjectTask, Announcement, UserProfile } from './types';

export const SEED_PROJECTS: Project[] = [
  {
    id: 'proj-ravel-3',
    name: 'مستشفى رافيل 3',
    code: 'MAS_RAV_03',
    description: 'مشروع إنشاء وتجهيز المستشفى التخصصي لمجموعة رافيل الطبية (المبنى الرئيسي ومبنى العلاج الطبيعي والمائي)',
    status: 'active',
    createdAt: '2026-01-10T08:00:00Z',
    updatedAt: '2026-01-10T08:00:00Z'
  },
  {
    id: 'proj-tahliya-towers',
    name: 'أبراج التحلية السكنية',
    code: 'TAH_TW_01',
    description: 'أبراج سكنية وإدارية 32 طابقاً مع مواقف سفلية ومول تجاري',
    status: 'active',
    createdAt: '2026-02-01T08:00:00Z',
    updatedAt: '2026-02-01T08:00:00Z'
  },
  {
    id: 'proj-metro-station',
    name: 'محطة المترو المركزية',
    code: 'MTR_CENT_04',
    description: 'أعمال التشطيبات المعمارية والكهرو-ميكانيكية للمحطة المركزية',
    status: 'active',
    createdAt: '2026-02-15T08:00:00Z',
    updatedAt: '2026-02-15T08:00:00Z'
  }
];

export const SEED_USERS: UserProfile[] = [
  {
    id: 'user-admin-01',
    email: 'admin@dc-manager.com',
    displayName: 'أ/ أحمد المنصور (مدير DC)',
    role: 'admin',
    assignedProjects: ['proj-ravel-3', 'proj-tahliya-towers', 'proj-metro-station'],
    status: 'active',
    phone: '+966 50 123 4567',
    createdAt: '2026-01-01T08:00:00Z',
    updatedAt: '2026-01-01T08:00:00Z'
  },
  {
    id: 'user-site-ravel',
    email: 'site.ravel@dc-manager.com',
    displayName: 'م/ كريم عبد الرحمن',
    role: 'site',
    assignedProjects: ['proj-ravel-3'],
    status: 'active',
    phone: '+966 55 987 6543',
    createdAt: '2026-01-15T08:00:00Z',
    updatedAt: '2026-01-15T08:00:00Z'
  },
  {
    id: 'user-site-tahliya',
    email: 'site.tahliya@dc-manager.com',
    displayName: 'م/ ليلى الهاشمي',
    role: 'site',
    assignedProjects: ['proj-tahliya-towers'],
    status: 'active',
    phone: '+966 54 332 1100',
    createdAt: '2026-02-01T08:00:00Z',
    updatedAt: '2026-02-01T08:00:00Z'
  }
];

// Today's date in YYYY-MM-DD format
export const getTodayDateStr = () => new Date().toISOString().split('T')[0];

export const SEED_REPORTS: DailyReport[] = [
  {
    id: 'rep-sample-ravel-01',
    projectId: 'proj-ravel-3',
    projectName: 'مستشفى رافيل 3',
    reportDate: getTodayDateStr(),
    senderId: 'user-site-ravel',
    senderName: 'م/ كريم عبد الرحمن',
    senderEmail: 'site.ravel@dc-manager.com',
    submittedWorks: [
      {
        id: 'sub-01',
        rowNumber: 1,
        itemDescription: 'Columns for hydrotherapy (أعمدة مبنى العلاج المائي)',
        submittalNumber: 'MAS_RAV_IR_STR_0055',
        rev: 1,
        status: 'W'
      },
      {
        id: 'sub-02',
        rowNumber: 2,
        itemDescription: 'Waterproofing material samples for basement 2 (عزل الرطوبة للقبو الثاني)',
        submittalNumber: 'MAS_RAV_MT_ARC_0012',
        rev: 2,
        status: 'W'
      }
    ],
    receivedWorks: [
      {
        id: 'rec-01',
        rowNumber: 1,
        itemDescription: 'Columns for hydrotherapy (أعمدة مبنى العلاج المائي)',
        submittalNumber: 'MAS_RAV_SD_STR_0055',
        rev: 5,
        status: 'B'
      },
      {
        id: 'rec-02',
        rowNumber: 2,
        itemDescription: 'Firefighting main pump shop drawings (مخططات مضخات الإطفاء الرئيسية)',
        submittalNumber: 'MAS_RAV_SD_MEP_0088',
        rev: 3,
        status: 'A'
      }
    ],
    notes: 'تم استلام اعتماد مخططات أعمدة العلاج المائي بملاحظات وجاري استيفاء تعليقات المهندس المشرف في الموقع.',
    attachments: [
      {
        name: 'Transmittal_MAS_RAV_0055.pdf',
        url: 'https://images.unsplash.com/photo-1541888946425-d0fbb186156f?w=600&auto=format&fit=crop&q=80',
        size: 1024 * 340,
        type: 'application/pdf'
      }
    ],
    status: 'submitted',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'rep-sample-history-02',
    projectId: 'proj-ravel-3',
    projectName: 'مستشفى رافيل 3',
    // 10 days ago report to show stalled submittal W > 7 days
    reportDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    senderId: 'user-site-ravel',
    senderName: 'م/ كريم عبد الرحمن',
    senderEmail: 'site.ravel@dc-manager.com',
    submittedWorks: [
      {
        id: 'sub-old-01',
        rowNumber: 1,
        itemDescription: 'Main chiller foundation structural calculation (حسابات قواعد الشيلرات الرئيسية)',
        submittalNumber: 'MAS_RAV_CALC_STR_0019',
        rev: 0,
        status: 'W' // Stuck for 10 days!
      }
    ],
    receivedWorks: [
      {
        id: 'rec-old-01',
        rowNumber: 1,
        itemDescription: 'HVAC Ductwork sample specification (عينة مواسير التكييف)',
        submittalNumber: 'MAS_RAV_MT_MEP_0004',
        rev: 1,
        status: 'C'
      }
    ],
    notes: 'بانتظار موافقة الاستشاري على حسابات الأحمال الديناميكية للشيلرات.',
    status: 'reviewed',
    adminFeedback: 'تم التذكير خلال الاجتماع الفني وننتظر رد الاستشاري.',
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
  }
];

export const SEED_ISSUES: IssueReport[] = [
  {
    id: 'iss-sample-01',
    issueNumber: 'ISS-2026-001',
    projectId: 'proj-ravel-3',
    projectName: 'مستشفى رافيل 3',
    authorId: 'user-site-ravel',
    authorName: 'م/ كريم عبد الرحمن',
    type: 'documents_archive',
    priority: 'urgent',
    description: 'تأخر اعتماد مخططات التكييف (HVAC) من الاستشاري المشرف للأدوار العلاجية مما يهدد بتوقف أعمال الجبس بورد.',
    photoUrl: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800&auto=format&fit=crop&q=80',
    status: 'in_progress',
    adminComment: 'تم التواصل مباشرة مع رئيس جهاز الإشراف وسيتم إرسال الرد المعتمد غداً صباحاً.',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'iss-sample-02',
    issueNumber: 'ISS-2026-002',
    projectId: 'proj-tahliya-towers',
    projectName: 'أبراج التحلية السكنية',
    authorId: 'user-site-tahliya',
    authorName: 'م/ ليلى الهاشمي',
    type: 'network',
    priority: 'normal',
    description: 'انقطاع شبكة الإنترنت في كرفان مهندسي المكتب الفني للموقع مما يعيق تنزيل وتدقيق النماذج.',
    status: 'new',
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
  }
];

export const SEED_TASKS: ProjectTask[] = [
  {
    id: 'task-sample-01',
    projectId: 'proj-ravel-3',
    projectName: 'مستشفى رافيل 3',
    title: 'تسليم ومطابقة سجل التقديمات (Submittal Log) لشهر فبراير',
    description: 'يرجى مراجعة كافة تقديمات الأعمال الإنشائية والمعمارية والتأكد من مطابقة أرقام المراجعات (REV) مع سجل الاستشاري.',
    deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    priority: 'urgent',
    status: 'in_progress',
    createdBy: 'user-admin-01',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'task-sample-02',
    projectId: 'proj-tahliya-towers',
    projectName: 'أبراج التحلية السكنية',
    title: 'أرشفة النسخ الورقية المعتمدة من عينات التشطيب',
    description: 'ترتيب عينات الدهانات وبطاقات الموقف في دولاب الأرشيف المعتمد وإرسال صورة إثبات.',
    // Overdue task to demonstrate overdue KPI flag!
    deadline: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    priority: 'normal',
    status: 'pending',
    createdBy: 'user-admin-01',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
  }
];

export const SEED_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'ann-01',
    title: 'تنبيه هام بخصوص تقديم التقارير اليومية قبل الساعة الرابعة عصراً',
    content: 'السادة مهندسو ومراقبو الوثائق بالمواقع: يُرجى الالتزام الصارم بإرسال تقرير الأعمال اليومي قبل الساعة 16:00 حتى يتسنى لإدارة DC إصدار الموقف التجميعي اليومي للمشاريع.',
    targetProjects: [], // all
    isUrgent: true,
    createdBy: 'user-admin-01',
    authorName: 'أ/ أحمد المنصور (مدير DC)',
    readBy: ['user-site-ravel'],
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  }
];
