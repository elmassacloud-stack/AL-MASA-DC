import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Building,
  Mail,
  Phone,
  Shield,
  CheckCircle2,
  XCircle,
  Edit2,
  Lock,
  Unlock,
  X,
  LogIn
} from 'lucide-react';
import { UserProfile, Project, UserRole } from '../../types';
import { dataService } from '../../services/dataService';

interface Props {
  users: UserProfile[];
  projects: Project[];
  currentUser: UserProfile;
  onSwitchUser: (user: UserProfile) => void;
}

export const AdminUsersView: React.FC<Props> = ({
  users,
  projects,
  currentUser,
  onSwitchUser
}) => {
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  // New user form state
  const [email, setEmail] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [role, setRole] = useState<UserRole>('site');
  const [assignedProjects, setAssignedProjects] = useState<string[]>(['proj-ravel-3']);
  const [phone, setPhone] = useState<string>('');

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !displayName.trim()) return;

    dataService.addUser({
      email: email.trim().toLowerCase(),
      displayName: displayName.trim(),
      role,
      assignedProjects: role === 'admin' ? projects.map((p) => p.id) : assignedProjects,
      status: 'active',
      phone: phone.trim()
    });

    setIsCreating(false);
    setEmail('');
    setDisplayName('');
    setPhone('');
    setAssignedProjects(['proj-ravel-3']);
  };

  const handleUpdateProjects = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    dataService.updateUser(editingUser.id, {
      assignedProjects: editingUser.assignedProjects
    });

    setEditingUser(null);
  };

  const toggleStatus = (user: UserProfile) => {
    const nextStatus = user.status === 'active' ? 'disabled' : 'active';
    dataService.updateUser(user.id, { status: nextStatus });
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <span>إدارة مستخدمي ومسؤولي المواقع (Users & Access)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium">
            إضافة مهندسي المواقع، تحديد الصلاحيات (Admin / Site)، وإسناد المشاريع المعتمدة
          </p>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer shadow-xs self-start sm:self-auto transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          <span>إضافة مستخدم جديد</span>
        </button>
      </div>

      {/* Users List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map((user) => {
          const isMe = user.id === currentUser.id;
          const userProjs = projects.filter((p) => user.assignedProjects.includes(p.id));

          return (
            <div
              key={user.id}
              className={`bg-white dark:bg-slate-900 rounded-2xl p-5 border transition-all shadow-xs flex flex-col justify-between ${
                user.status === 'disabled'
                  ? 'border-slate-300 dark:border-slate-800 opacity-60'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base text-slate-900 dark:text-white">
                        {user.displayName}
                      </h3>
                      {isMe && (
                        <span className="text-[10px] bg-blue-600 text-white px-2 py-0.2 rounded-full font-bold">
                          أنت
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 mt-1 font-medium">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>{user.email}</span>
                    </div>
                  </div>

                  {/* Role pill */}
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                      user.role === 'admin'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                    }`}
                  >
                    {user.role === 'admin' ? 'مدير DC' : 'مهندس موقع'}
                  </span>
                </div>

                {/* Status Indicator */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">حالة الحساب:</span>
                  {user.status === 'active' ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>نشط</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-600 font-bold">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>معطل</span>
                    </span>
                  )}
                </div>

                {/* Assigned Projects */}
                <div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    المشاريع المسندة:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {user.role === 'admin' ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        كافة مشاريع الشركة (صلاحية كاملة)
                      </span>
                    ) : userProjs.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic">
                        لم يتم تعيين مشاريع بعد
                      </span>
                    ) : (
                      userProjs.map((p) => (
                        <span
                          key={p.id}
                          className="text-[11px] px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900"
                        >
                          {p.name}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                {/* Switch to user test button */}
                <button
                  type="button"
                  onClick={() => onSwitchUser(user)}
                  className="px-2.5 py-1.5 rounded-lg font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 flex items-center gap-1 cursor-pointer"
                  title="تجربة الدخول بهذا المستخدم"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>دخول كـ {user.displayName.split(' ')[0]}</span>
                </button>

                <div className="flex items-center gap-1">
                  {user.role === 'site' && (
                    <button
                      onClick={() => setEditingUser(user)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg cursor-pointer"
                      title="تعديل المشاريع المسندة"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}

                  {!isMe && (
                    <button
                      onClick={() => toggleStatus(user)}
                      className="p-1.5 text-slate-500 hover:text-red-500 rounded-lg cursor-pointer"
                      title={user.status === 'active' ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                    >
                      {user.status === 'active' ? (
                        <Lock className="w-4 h-4" />
                      ) : (
                        <Unlock className="w-4 h-4 text-emerald-600" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Projects Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-5 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">
                  تعديل المشاريع المسندة للمستخدم
                </h3>
                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">{editingUser.displayName}</p>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateProjects} className="space-y-4 text-xs sm:text-sm">
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {projects.map((p) => {
                  const isChecked = editingUser.assignedProjects.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleProjectInEdit(p.id)}
                        className="w-4 h-4 rounded-md text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">
                          {p.name}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">{p.code}</span>
                      </div>
                    </label>
                  );
                })}
              </div>

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
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl cursor-pointer shadow-xs"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl p-5 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white">
                إضافة مستخدم موقع أو مدير جديد
              </h3>
              <button
                onClick={() => setIsCreating(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  الاسم الكامل
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
                  البريد الإلكتروني للوجين (Email)
                </label>
                <input
                  type="email"
                  required
                  placeholder="engineer@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-mono text-left"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الدور والصلاحية (Role)
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-bold"
                  >
                    <option value="site">site (مهندس موقع - يرى ويكتب بيانات مشاريعه فقط)</option>
                    <option value="admin">admin (مدير DC - يرى ويدير كل شيء)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    رقم الجوال (اختياري)
                  </label>
                  <input
                    type="text"
                    placeholder="+966 50 000 0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-mono text-left"
                  />
                </div>
              </div>

              {/* Projects Assignment (if site role) */}
              {role === 'site' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    المشاريع المصرح بها لهذا المهندس:
                  </label>
                  <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 max-h-36 overflow-y-auto">
                    {projects.map((p) => {
                      const isChecked = assignedProjects.includes(p.id);
                      return (
                        <label key={p.id} className="flex items-center gap-2 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleProjectInAssign(p.id)}
                            className="w-4 h-4 rounded-md text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-slate-800 dark:text-slate-200">{p.name} ({p.code})</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl cursor-pointer shadow-xs"
                >
                  إنشاء المستخدم
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
