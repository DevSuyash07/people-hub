import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Employees from "./pages/Employees.tsx";
import Departments from "./pages/Departments.tsx";
import Profile from "./pages/Profile.tsx";
import Settings from "./pages/Settings.tsx";
import Attendance from "./pages/Attendance.tsx";
import Leave from "./pages/Leave.tsx";
import CalendarPage from "./pages/Calendar.tsx";
import Reports from "./pages/Reports.tsx";
import Tasks from "./pages/Tasks.tsx";
import MyTeam from "./pages/MyTeam.tsx";
import Projects from "./pages/Projects.tsx";
import MyChats from "./pages/MyChats.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
            <Route path="/projects" element={<ProtectedRoute allow={["admin", "employee"]}><Projects /></ProtectedRoute>} />
            <Route path="/my-chats" element={<ProtectedRoute allow={["admin", "employee"]}><MyChats /></ProtectedRoute>} />
            <Route path="/my-team" element={<ProtectedRoute><MyTeam /></ProtectedRoute>} />
            <Route path="/employees" element={<ProtectedRoute allow={["admin", "hr"]}><Employees /></ProtectedRoute>} />
            <Route path="/departments" element={<ProtectedRoute allow={["admin", "hr"]}><Departments /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/attendance" element={<ProtectedRoute><Attendance /></ProtectedRoute>} />
            <Route path="/leave" element={<ProtectedRoute><Leave /></ProtectedRoute>} />
            <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute allow={["admin", "hr"]}><Reports /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute allow={["admin"]}><Settings /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
