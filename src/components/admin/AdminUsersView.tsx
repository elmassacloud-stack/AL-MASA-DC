import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Mail,
  Phone,
  CheckCircle2,
  XCircle,
  Edit2,
  Lock,
  Unlock,
  X,
  Trash2,
  Briefcase,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Search,
  Hammer,
  FileUp
} from 'lucide-react';
import { UserProfile, Project, UserRole } from '../../types';
import { dataService } from '../../services/dataService';
import { translateFirebaseAuthError } from '../../services/firebase';
import { isSuperAdminEmail } from '../../config';

interface Props {
  users: UserProfile[];
  projects: Project[];
  currentUser: UserProfile;
}

export const AdminUsersView: React.FC<Props> = ({
  users,
  projects,
  currentUser
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // New user form state
  const [displayName, setDisplayName] = useState<string>('');
  const [jobTitle, setJobTitle] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [role, setRole] = useState<UserRole>('site');
  const [allProjects, setAllProjects] = useState<boolean>(false);
  const [canAccessExecutedWorks, setCanAccessExecutedWorks] = useState<boolean>(true);
  const [canAccessSiteDeliverables, setCanAccessSiteDeliverables] = useState<boolean>(true);
  const [assignedProjects, setAssignedProjects] = useState<string[]>(
    projects[0]?.id ? [projects[0].id] : []
  );
  const [phone, setPhone] = useState<string>('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState<boolean>(false);

  // Edit user state
  const [editError, setEditError] = useState<string | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 3500);
  };

  const resetCreateForm = () => {
    setDisplayName('');
    setJobTitle('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setRole('site');
    setAllProjects(false);
    setCanAccessExecutedWorks(true);
    setCanAccessSiteDeliverables(true);
    setAssignedProjects(projects[0]?.id ? [projects[0].id] : []);
    setPhone('');
    setCreateError(null);
  };

  const handleOpenCreateModal = () => {
    resetCreateForm();
    setIsCreating(true);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!displayName.trim() || !jobTitle.trim() || !email.trim() || !password) {
      setCreateError('يرجى تعبئة جميع الحقول الإلزامية (الاسم، المسمى الوظيفي، البريد، كلمة المرور).');
      return;
    }

    if (password.length < 6) {
      setCreateError('كلمة المرور يجب أن تتكون من 6 أحرف على الأقل.');
      return;
    }

    if (role === 'site' && !allProjects && assignedProjects.length === 0) {
      setCreateError('يرجى تحديد مشروع واحد على الأقل أو تفعيل خيار "جميع المشاريع".');
      return;
    }

    setIsSubmittingCreate(true);
    try {
      await dataService.createUserWithAuth({
        displayName: displayName.trim(),
        jobTitle: jobTitle.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
        allProjects: role === 'admin' ? true : allProjects,
        canAccessExecutedWorks: role === 'admin' ? true : canAccessExecutedWorks,
        canAccessSiteDeliverables: role === 'admin' ? true : canAccessSiteDeliverables,
        assignedProjects: role === 'admin' || allProjects ? projects.map((p) => p.id) : assignedProjects,
        phone: phone.trim()
      });

      setIsCreating(false);
      resetCreateForm();
      showToast('تم إنشاء حساب المستخدم وإضافته بنجاح.');
    } catch (err) {
      setCreateError(translateFirebaseAuthError(err));
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError(null);

    if (!editingUser.displayName.trim()) {
      setEditError('يرجى إدخال الاسم الكامل للمستخدم.');
      return;
    }

    const isAll = editingUser.role === 'admin' || Boolean(editingUser.allProjects);
    if (!isAll && (!editingUser.assignedProjects || editingUser.assignedProjects.length === 0)) {
      setEditError('يرجى تحديد مشروع واحد على الأقل أو تفعيل خيار "جميع المشاريع".');
      return;
    }

    setIsSubmittingEdit(true);
    try {
      await dataService.updateUser(editingUser.id, {
        displayName: editingUser.displayName.trim(),
        jobTitle: (editingUser.jobTitle || '').trim(),
        role: editingUser.role,
        allProjects: isAll,
        canAccessExecutedWorks:
          editingUser.role === 'admin' ? true : editingUser.canAccessExecutedWorks !== false,
        canAccessSiteDeliverables:
          editingUser.role === 'admin' ? true : editingUser.canAccessSiteDeliverables !== false,
        assignedProjects: isAll ? projects.map((p) => p.id) : editingUser.assignedProjects,
        phone: (editingUser.phone || '').trim() || undefined
      });
      setEditingUser(null);
      showToast('تم تحديث بيانات المستخدم والمشاريع المسندة بنجاح.');
    } catch {
      setEditError('حدث خطأ أثناء حفظ التعديلات. يرجى المحاولة مجدداً.');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const toggleStatus = async (user: UserProfile) => {
    if (isSuperAdminEmail(user.email) || user.id === currentUser.id) return;
    const nextStatus = user.status === 'active' ? 'disabled' : 'active';
    await dataService.updateUser(user.id, { status: nextStatus });
    showToast(nextStatus === 'active' ? `تم تفعيل حساب ${user.displayName}.` : `تم تعطيل حساب ${user.displayName}.`);
  };

  const handleDeleteUser = async (user: UserProfile) => {
    if (isSuperAdminEmail(user.email) || user.id === currentUser.id) return;
    const ok = await dataService.deleteUser(user.id);
    setConfirmDeleteId(null);
    if (ok) {
      showToast(`تم حذف حساب ${user.displayName} من النظام.`);
    }
  };

  const toggleProjectInAssign = (projId: string) => {
    setAssignedProjects((prev) =>
      prev.includes(projId) ? prev.filter((id) => id !== projId) : [...prev, projId]
    );
  };

  const toggleProjectInEdit = (projId: string) => {
    if (!editingUser) return;
    const current = editingUser.assignedProjects || [];
    const updated = current.includes(projId)
      ? current.filter((id) => id !== projId)
      : [...current, projId];
    setEditingUser({ ...editingUser, assignedProjects: updated });
  };

  const filteredUsers = users.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.displayName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.jobTitle || '').toLowerCase().includes(q)
    );
  });

  const activeCount = users.filter((u) => u.status === 'active').length;
  const disabledCount = users.filter((u) => u.status === 'disabled').length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <span>إدارة المستخدمين والصلاحيات</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium mt-0.5">
            إضافة المستخدمين، تحديد المسمى الوظيفي وكلمة المرور، وتخصيص المواقع والمشاريع المصرح بها
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer shadow-xs self-start sm:self-auto transition-colors whitespace-nowrap"
        >
          <UserPlus className="w-4 h-4" />
          <span>إضافة مستخدم جديد</span>
        </button>
      </div>

      {actionFeedback && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* Search & Summary Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم، المسمى الوظيفي، أو البريد الإلكتروني..."
            className="w-full h-10 pr-9 pl-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
        </div>

        <div className="flex items-center gap-2 text-xs font-bold tabular-nums">
          <span className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            الإجمالي: {users.length}
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            نشط: {activeCount}
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            معطل: {disabledCount}
          </span>
        </div>
      </div>

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredUsers.map((user) => {
          const isMe = user.id === currentUser.id;
          const isSuper = isSuperAdminEmail(user.email);
          const hasAll = user.role === 'admin' || user.allProjects === true || isSuper;
          const userProjs = projects.filter((p) => (user.assignedProjects || []).includes(p.id));
          const isConfirmingDelete = confirmDeleteId === user.id;

          return (
            <div
              key={user.id}
              className={`bg-white dark:bg-slate-900 rounded-2xl p-5 border transition-all shadow-xs flex flex-col justify-between ${
                user.status === 'disabled'
                  ? 'border-rose-200 dark:border-rose-900/60 opacity-75'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="space-y-3">
                {/* User Header */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="font-bold text-base text-slate-900 dark:text-white truncate">
                        {user.displayName}
                      </h3>
                      {isMe && (
                        <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold">
                          أنت
                        </span>
                      )}
                      {isSuper && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800 px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          <span>المسؤول الرئيسي</span>
                        </span>
                      )}
                    </div>

                    {user.jobTitle && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 mt-1 font-semibold">
                        <Briefcase className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="truncate">{user.jobTitle}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 mt-1 font-mono">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate" dir="ltr">{user.email}</span>
                    </div>

                    {user.phone && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 mt-0.5 font-mono">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span dir="ltr">{user.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Role Badge */}
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-bold shrink-0 ${
                      user.role === 'admin' || isSuper
                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                    }`}
                  >
                    {user.role === 'admin' || isSuper ? 'مسؤول نظام (Admin)' : 'مستخدم موقع'}
                  </span>
                </div>

                {/* Status Indicator */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">حالة الحساب:</span>
                  {user.status === 'active' ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>نشط ومفعل</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-bold">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>معطل</span>
                    </span>
                  )}
                </div>

                {/* Assigned Projects */}
                <div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                    المشاريع والمواقع المصرح بها:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {hasAll ? (
                      <span className="text-[11px] px-2.5 py-1 rounded-md font-bold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        جميع المشاريع (صلاحية كاملة)
                      </span>
                    ) : userProjs.length === 0 ? (
                      <span className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                        لا توجد مشاريع مسندة
                      </span>
                    ) : (
                      userProjs.map((p) => (
                        <span
                          key={p.id}
                          className="text-[11px] px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 font-semibold"
                        >
                          {p.name}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Tab Permissions Indicator */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400 font-medium flex items-center gap-1">
                      <Hammer className="w-3.5 h-3.5 text-amber-600" />
                      <span>تبويب الأعمال المنفذة:</span>
                    </span>
                    {user.role === 'admin' || isSuper || user.canAccessExecutedWorks !== false ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-md font-bold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        مصرح بالوصول
                      </span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-md font-bold bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                        محجوب
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400 font-medium flex items-center gap-1">
                      <FileUp className="w-3.5 h-3.5 text-blue-600" />
                      <span>تبويب تسليمات PDF:</span>
                    </span>
                    {user.role === 'admin' || isSuper || user.canAccessSiteDeliverables !== false ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-md font-bold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        مصرح بالوصول
                      </span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-md font-bold bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                        محجوب
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 mt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
                {isConfirmingDelete ? (
                  <div className="flex items-center justify-between gap-2 bg-rose-50 dark:bg-rose-950/50 p-2 rounded-xl border border-rose-200 dark:border-rose-800">
                    <span className="font-bold text-rose-800 dark:text-rose-200">تأكيد حذف المستخدم؟</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDeleteUser(user)}
                        className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                      >
                        حذف نهائي
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditError(null);
                        setEditingUser({ ...user });
                      }}
                      className="px-3 py-1.5 rounded-lg font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950 dark:hover:text-blue-300 transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="تعديل بيانات ومشاريع المستخدم"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>تعديل المشاريع والبيانات</span>
                    </button>

                    {!isSuper && !isMe && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleStatus(user)}
                          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                            user.status === 'active'
                              ? 'border-slate-200 dark:border-slate-700 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950'
                              : 'border-emerald-200 dark:border-emerald-800 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950'
                          }`}
                          title={user.status === 'active' ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                        >
                          {user.status === 'active' ? (
                            <Lock className="w-4 h-4" />
                          ) : (
                            <Unlock className="w-4 h-4" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(user.id)}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors cursor-pointer"
                          title="حذف المستخدم"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit User & Assigned Projects Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl p-5 sm:p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  تعديل بيانات المستخدم والمشاريع
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-mono mt-0.5" dir="ltr">
                  {editingUser.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/80 border border-red-300 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditUser} className="space-y-4 text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الاسم الكامل
                  </label>
                  <input
                    type="text"
                    required
                    value={editingUser.displayName}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, displayName: e.target.value })
                    }
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    المسمى الوظيفي
                  </label>
                  <input
                    type="text"
                    value={editingUser.jobTitle || ''}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, jobTitle: e.target.value })
                    }
                    placeholder="مهندس موقع / مراقب وثائق"
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                  />
                </div>
              </div>

              {!isSuperAdminEmail(editingUser.email) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      الدور والصلاحية
                    </label>
                    <select
                      value={editingUser.role}
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          role: e.target.value as UserRole,
                          allProjects: e.target.value === 'admin' ? true : editingUser.allProjects
                        })
                      }
                      className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-bold"
                    >
                      <option value="site">مهندس / مراقب موقع (Site)</option>
                      <option value="admin">مسؤول النظام / مدير DC (Admin)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      رقم الجوال (اختياري)
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={editingUser.phone || ''}
                      onChange={(e) =>
                        setEditingUser({ ...editingUser, phone: e.target.value })
                      }
                      className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-mono text-left"
                    />
                  </div>
                </div>
              )}

              {/* Tab & Projects Access Permissions */}
              {editingUser.role === 'site' && (
                <div className="space-y-2.5">
                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingUser.canAccessExecutedWorks !== false}
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          canAccessExecutedWorks: e.target.checked
                        })
                      }
                      className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <span className="font-bold text-amber-900 dark:text-amber-200 text-xs flex items-center gap-1.5">
                        <Hammer className="w-3.5 h-3.5" />
                        <span>صلاحية الوصول إلى تبويب «الأعمال المنفذة بالموقع»</span>
                      </span>
                      <span className="text-[11px] text-amber-700 dark:text-amber-400">
                        يتيح للمستخدم عرض وتسجيل بنود الأعمال المنفذة للمشاريع المسندة إليه
                      </span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingUser.canAccessSiteDeliverables !== false}
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          canAccessSiteDeliverables: e.target.checked
                        })
                      }
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="font-bold text-blue-900 dark:text-blue-200 text-xs flex items-center gap-1.5">
                        <FileUp className="w-3.5 h-3.5" />
                        <span>صلاحية الوصول إلى تبويب «تسليمات واستلامات PDF»</span>
                      </span>
                      <span className="text-[11px] text-blue-700 dark:text-blue-400">
                        يتيح للمستخدم إرسال ملفات PDF للمستندات المستلمة بالموقع (تُحذف بعد 48 ساعة)
                      </span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(editingUser.allProjects)}
                      onChange={(e) =>
                        setEditingUser({ ...editingUser, allProjects: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-bold text-emerald-900 dark:text-emerald-200 text-xs block">
                        منح صلاحية الوصول إلى "جميع المشاريع"
                      </span>
                      <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                        يتيح للمستخدم عرض وتقديم التقارير لجميع المشاريع الحالية والمستقبلية
                      </span>
                    </div>
                  </label>

                  {!editingUser.allProjects && (
                    <div className="space-y-2 max-h-52 overflow-y-auto p-1">
                      <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                        أو اختر المشاريع / المواقع المحددة:
                      </span>
                      {projects.map((p) => {
                        const isChecked = (editingUser.assignedProjects || []).includes(p.id);
                        return (
                          <label
                            key={p.id}
                            className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleProjectInEdit(p.id)}
                              className="w-4 h-4 rounded-md text-blue-600 focus:ring-blue-500"
                            />
                            <div>
                              <span className="font-bold text-slate-800 dark:text-slate-200 block text-xs">
                                {p.name}
                              </span>
                              <span className="text-[11px] text-slate-500 font-mono">{p.code}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl cursor-pointer shadow-xs flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmittingEdit && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>حفظ التعديلات</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create New User Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl p-5 sm:p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  إضافة مستخدم جديد للنظام
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  يُنشأ الحساب فوراً في Firebase Authentication مع تعيين المشاريع المصرح بها
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/80 border border-red-300 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4 text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الاسم الكامل <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: م/ عبد الله الشمري"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    المسمى الوظيفي <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: مهندس موقع / مراقب وثائق"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    البريد الإلكتروني <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      dir="ltr"
                      placeholder="engineer@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-11 pr-9 pl-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-mono text-left"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    كلمة المرور <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      dir="ltr"
                      placeholder="6 أحرف على الأقل"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full h-11 pr-9 pl-9 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-mono text-left"
                    />
                    <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute left-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الدور والصلاحية
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-bold"
                  >
                    <option value="site">مهندس / مراقب موقع (مقيد بمشاريع)</option>
                    <option value="admin">مسؤول النظام / مدير DC (كامل الصلاحيات)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    رقم الجوال (اختياري)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="+966 50 000 0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-mono text-left"
                  />
                </div>
              </div>

              {/* Projects & Tab Access Assignment (if site role) */}
              {role === 'site' && (
                <div className="space-y-2.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    صلاحيات الوصول للأقسام والمشاريع:
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={canAccessExecutedWorks}
                      onChange={(e) => setCanAccessExecutedWorks(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                    />
                    <span className="font-bold text-amber-900 dark:text-amber-200 text-xs flex items-center gap-1.5">
                      <Hammer className="w-3.5 h-3.5" />
                      <span>السماح بالوصول إلى تبويب «الأعمال المنفذة بالموقع»</span>
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={canAccessSiteDeliverables}
                      onChange={(e) => setCanAccessSiteDeliverables(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-bold text-blue-900 dark:text-blue-200 text-xs flex items-center gap-1.5">
                      <FileUp className="w-3.5 h-3.5" />
                      <span>السماح بالوصول إلى تبويب «تسليمات واستلامات PDF»</span>
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allProjects}
                      onChange={(e) => setAllProjects(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-bold text-emerald-900 dark:text-emerald-200 text-xs">
                      جميع المشاريع (منح صلاحية الوصول لكافة المواقع)
                    </span>
                  </label>

                  {!allProjects && (
                    <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 max-h-40 overflow-y-auto">
                      {projects.length === 0 ? (
                        <p className="text-xs text-slate-500">لا توجد مشاريع مضافة حالياً.</p>
                      ) : (
                        projects.map((p) => {
                          const isChecked = assignedProjects.includes(p.id);
                          return (
                            <label key={p.id} className="flex items-center gap-2 cursor-pointer text-xs py-1">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleProjectInAssign(p.id)}
                                className="w-4 h-4 rounded-md text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-slate-800 dark:text-slate-200 font-semibold">
                                {p.name} ({p.code})
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl cursor-pointer shadow-xs flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmittingCreate && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>إنشاء المستخدم</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
