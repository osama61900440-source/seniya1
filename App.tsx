import React, { useState } from 'react';
import Sidebar, { menuItems, getStoredUserSession, UserSession, MenuItem } from './components/Sidebar';

export { Sidebar, menuItems, getStoredUserSession };
export type { UserSession, MenuItem };

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const currentUser = getStoredUserSession();

  return (
    <div className="min-h-screen bg-[#F5F7F9]">
      {sidebarOpen && (
        <Sidebar
          currentUser={currentUser}
          onClose={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
