import React, { useEffect, useState } from 'react';

export interface MenuItem {
  id: string;
  icon?: string;
  text?: string;
  roles: string[];
  allowedRoles: string[];
  isDivider?: boolean;
  onClick?: () => void;
}

export interface UserSession {
  role: 'admin' | 'employee' | string;
  name?: string;
  jobTitle?: string;
  roleTitle?: string;
  employeeRole?: string;
  isOwner?: boolean;
  [key: string]: any;
}

// 1. Dynamic Array Filtering Logic:
// Navigation menu array with explicit roles and allowedRoles properties
export const menuItems: MenuItem[] = [
  {
    id: 'profile',
    icon: '🏪',
    text: 'የንግድ መረጃ',
    roles: ['admin'],
    allowedRoles: ['admin'],
  },
  {
    id: 'items',
    icon: '📦',
    text: 'የዕቃ ክምችት',
    roles: ['admin', 'employee'],
    allowedRoles: ['admin', 'employee'],
  },
  {
    id: 'receive_shipment',
    icon: '🚚',
    text: 'አዲስ ጭነት መመዝገቢያ',
    roles: ['admin', 'employee'],
    allowedRoles: ['admin', 'employee'],
  },
  {
    id: 'allocgoal',
    icon: '💰',
    text: 'የትርፍ ክፍፍል',
    roles: ['admin'],
    allowedRoles: ['admin'],
  },
  {
    id: 'employees',
    icon: '👥',
    text: 'የሰራተኞች ቁጥጥር',
    roles: ['admin'],
    allowedRoles: ['admin'],
  },
  {
    id: 'sales_report',
    icon: '📊',
    text: 'የሽያጭና ወጪ ሪፖርት',
    roles: ['admin', 'employee'],
    allowedRoles: ['admin', 'employee'],
  },
  {
    id: 'bank_report',
    icon: '📄',
    text: 'የባንክ ሪፖርት ማውጫ',
    roles: ['admin'],
    allowedRoles: ['admin'],
  },
  {
    id: 'shipment_history',
    icon: '📜',
    text: 'የጭነት ታሪክ',
    roles: ['admin', 'employee'],
    allowedRoles: ['admin', 'employee'],
  },
  {
    id: 'suppliers',
    icon: '🚛',
    text: 'የዕቃ አስራካቢዎች መረጃ',
    roles: ['admin', 'employee'],
    allowedRoles: ['admin', 'employee'],
  },
  {
    id: 'customers',
    icon: '👥',
    text: 'የደንበኞች መረጃ',
    roles: ['admin', 'employee'],
    allowedRoles: ['admin', 'employee'],
  },
  {
    id: 'help',
    icon: '💬',
    text: 'እርዳታና ድጋፍ',
    roles: ['admin', 'employee'],
    allowedRoles: ['admin', 'employee'],
  },
  {
    id: 'divider',
    roles: ['admin', 'employee'],
    allowedRoles: ['admin', 'employee'],
    isDivider: true,
  },
  {
    id: 'settings',
    icon: '⚙️',
    text: 'ቅንብሮች',
    roles: ['admin', 'employee'],
    allowedRoles: ['admin', 'employee'],
  },
  {
    id: 'logout',
    icon: '🚪',
    text: 'ወደ ውጭ ውጣ',
    roles: ['admin', 'employee'],
    allowedRoles: ['admin', 'employee'],
  },
];

// Helper to pull role from Auth/Session storage (e.g. 'employee' or 'admin')
export function getStoredUserSession(): UserSession {
  if (typeof window === 'undefined') return { role: 'employee' };

  let user: any = null;

  try {
    const sUser = sessionStorage.getItem('currentUser') || sessionStorage.getItem('authUser') || sessionStorage.getItem('auth_user');
    if (sUser) user = JSON.parse(sUser);
    const sRole = sessionStorage.getItem('role') || sessionStorage.getItem('userRole');
    if (sRole) {
      if (!user) user = {};
      user.role = sRole;
    }
  } catch (e) {}

  if (!user) {
    try {
      const lUser = localStorage.getItem('currentUser') || localStorage.getItem('authUser') || localStorage.getItem('auth_user');
      if (lUser) user = JSON.parse(lUser);
      const lRole = localStorage.getItem('role') || localStorage.getItem('userRole');
      if (lRole) {
        if (!user) user = {};
        user.role = lRole;
      }
    } catch (e) {}
  }

  const rawRole = String((user && user.role) || '').toLowerCase().trim();
  let normalizedRole: 'admin' | 'employee' = 'employee';

  if (
    rawRole === 'admin' ||
    rawRole === 'owner' ||
    rawRole === 'administrator' ||
    rawRole === 'superadmin' ||
    rawRole === 'ባለቤት' ||
    rawRole === 'የሱቅ ባለቤት' ||
    rawRole === 'አስተዳዳሪ' ||
    (user && user.isOwner === true)
  ) {
    normalizedRole = 'admin';
  } else {
    normalizedRole = 'employee';
  }

  let jobTitle = user?.jobTitle || user?.roleTitle || user?.employeeRole;
  if (!jobTitle && normalizedRole === 'employee') {
    try {
      const dataStr = localStorage.getItem('al-huda-pos-v1') || localStorage.getItem('habesha_pos_data');
      if (dataStr) {
        const parsed = JSON.parse(dataStr);
        if (parsed && Array.isArray(parsed.employees)) {
          const matched = parsed.employees.find((e: any) =>
            (user?.id && e.id === user.id) ||
            (user?.phone && e.phone === user.phone) ||
            (user?.name && e.name === user.name)
          );
          if (matched) {
            jobTitle = matched.jobTitle || matched.roleTitle || matched.role;
          }
        }
      }
    } catch (e) {}
  }

  const roleTitle = (jobTitle && String(jobTitle).trim()) || (normalizedRole === 'admin' ? 'አስተዳዳሪ' : 'ሰራተኛ');

  return {
    ...user,
    role: normalizedRole,
    name: user?.name || (normalizedRole === 'admin' ? 'የሱቅ ባለቤት' : 'ሰራተኛ'),
    jobTitle: roleTitle,
    roleTitle: roleTitle,
  };
}

export interface SidebarProps {
  currentUser?: UserSession;
  onClose?: () => void;
  onSelect?: (id: string) => void;
}

export function Sidebar({ currentUser: propUser, onClose, onSelect }: SidebarProps) {
  const [currentUser, setCurrentUser] = useState<UserSession>(() => {
    return propUser || getStoredUserSession();
  });

  useEffect(() => {
    if (propUser) {
      setCurrentUser(propUser);
    } else {
      setCurrentUser(getStoredUserSession());
    }
  }, [propUser]);

  // 1. Dynamic Array Filtering Logic:
  // Filter the menu list dynamically BEFORE rendering in JSX:
  const visibleMenuItems = menuItems.filter(item => item.allowedRoles.includes(currentUser.role));

  // 3. State Verification & Fallback:
  // If currentUser.role === 'employee', ensure forbidden items are never rendered
  const forbiddenTexts = ['የንግድ መረጃ', 'የትርፍ ክፍፍል', 'የሰራተኞች ቁጥጥር', 'የባንክ ሪፖርት ማውጫ'];
  const safeItems = currentUser.role === 'employee'
    ? visibleMenuItems.filter(item => !forbiddenTexts.includes(item.text || ''))
    : visibleMenuItems;

  // Dynamic Job Title Badge:
  // Dynamically display registered job title (e.g. currentUser.jobTitle or currentUser.roleTitle)
  // Fallback to "ሰራተኛ" if empty or undefined
  const jobTitleBadge = currentUser.role === 'admin'
    ? 'አስተዳዳሪ'
    : (currentUser.jobTitle || currentUser.roleTitle || currentUser.employeeRole || 'ሰራተኛ');

  return (
    <div className="drawer-overlay fixed inset-0 z-50 flex">
      <div className="drawer-bg fixed inset-0 bg-black/50" onClick={onClose} />
      <aside
        className="drawer canva-blue relative z-10 w-72 h-full bg-[#122B4A] text-white flex flex-col shadow-2xl"
        role="navigation"
        aria-label="Main Sidebar Navigation"
      >
        {/* Profile Card Header */}
        <div className="canva-profile-box p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-lg border border-white/40">
              👤
            </div>
            <div>
              <div className="text-xs text-white/70">ሰላም</div>
              <div className="font-bold text-sm text-white">{currentUser.name}</div>
            </div>
          </div>
          <span className="canva-role-badge text-xs bg-white/20 text-white px-2.5 py-1 rounded-full font-bold">
            {jobTitleBadge}
          </span>
        </div>

        {/* 2. Do NOT Hardcode HTML List: Render ONLY from visibleMenuItems.map(...) */}
        <nav className="canva-menu-list flex-1 overflow-y-auto p-3 space-y-1">
          {safeItems.map(item => {
            if (item.isDivider) {
              return <div key={item.id} className="canva-menu-divider my-2 border-t border-white/10" />;
            }
            return (
              <button
                key={item.id}
                id={`menu-btn-${item.id}`}
                type="button"
                className="canva-menu-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-semibold text-white/95 hover:bg-white/10 active:scale-98 transition-all"
                onClick={() => {
                  item.onClick?.();
                  onSelect?.(item.id);
                  onClose?.();
                }}
              >
                <span className="em-icon text-lg">{item.icon || '•'}</span>
                <span className="flex-1">{item.text}</span>
              </button>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}

export default Sidebar;
