import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, BarChart3, Users, CalendarCheck } from "lucide-react";
import { format, subDays, parseISO } from "date-fns";

type Department = { id: string; name: string };
type Employee = { id: string; full_name: string; email: string; department_id: string | null };
type AttendanceRow = {
  id: string;
  date: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
  employee_id: string;
};
type LeaveRow = {
  id: string;
  start_date: string;
  end_date: string;
  days: number;
  status: string;
  employee_id: string;
  leave_type_id: string;
};
type LeaveType = { id: string; name: string };

type ReportKind = "attendance" | "leave";

function toCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
}

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [kind, setKind] = useState<ReportKind>("attendance");
  const [from, setFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const [d, lt] = await Promise.all([
        supabase.from("departments").select("id,name").order("name"),
        supabase.from("leave_types").select("id,name").order("name"),
      ]);
      if (d.data) setDepartments(d.data);
      if (lt.data) setLeaveTypes(lt.data);
    })();
  }, []);

  async function runReport() {
    setLoading(true);
    const empQuery = supabase.from("employees").select("id,full_name,email,department_id");
    if (departmentId !== "all") empQuery.eq("department_id", departmentId);
    const { data: emps, error: empErr } = await empQuery;
    if (empErr) {
      toast.error(empErr.message);
      setLoading(false);
      return;
    }
    setEmployees((emps ?? []) as Employee[]);
    const empIds = (emps ?? []).map((e) => e.id);

    if (empIds.length === 0) {
      setAttendance([]);
      setLeaves([]);
      setLoading(false);
      return;
    }

    if (kind === "attendance") {
      const { data, error } = await supabase
        .from("attendance")
        .select("id,date,status,check_in,check_out,employee_id")
        .in("employee_id", empIds)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: false });
      if (error) toast.error(error.message);
      else setAttendance((data ?? []) as AttendanceRow[]);
    } else {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("id,start_date,end_date,days,status,employee_id,leave_type_id")
        .in("employee_id", empIds)
        .gte("start_date", from)
        .lte("start_date", to)
        .order("start_date", { ascending: false });
      if (error) toast.error(error.message);
      else setLeaves((data ?? []) as LeaveRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    runReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, from, to, departmentId]);

  const empMap = useMemo(() => {
    const m = new Map<string, Employee>();
    employees.forEach((e) => m.set(e.id, e));
    return m;
  }, [employees]);
  const deptMap = useMemo(() => {
    const m = new Map<string, string>();
    departments.forEach((d) => m.set(d.id, d.name));
    return m;
  }, [departments]);
  const ltMap = useMemo(() => {
    const m = new Map<string, string>();
    leaveTypes.forEach((l) => m.set(l.id, l.name));
    return m;
  }, [leaveTypes]);

  const stats = useMemo(() => {
    if (kind === "attendance") {
      const counts = { present: 0, absent: 0, late: 0, half_day: 0, on_leave: 0 } as Record<string, number>;
      attendance.forEach((a) => {
        counts[a.status] = (counts[a.status] || 0) + 1;
      });
      return counts;
    }
    const counts = { pending: 0, approved: 0, rejected: 0, cancelled: 0 } as Record<string, number>;
    leaves.forEach((l) => {
      counts[l.status] = (counts[l.status] || 0) + 1;
    });
    return counts;
  }, [kind, attendance, leaves]);

  function exportCSV() {
    if (kind === "attendance") {
      const rows = attendance.map((a) => {
        const e = empMap.get(a.employee_id);
        return {
          date: a.date,
          employee: e?.full_name ?? "",
          email: e?.email ?? "",
          department: e?.department_id ? deptMap.get(e.department_id) ?? "" : "",
          status: a.status,
          check_in: a.check_in ? format(parseISO(a.check_in), "HH:mm") : "",
          check_out: a.check_out ? format(parseISO(a.check_out), "HH:mm") : "",
        };
      });
      downloadCSV(`attendance_${from}_to_${to}.csv`, toCSV(rows));
    } else {
      const rows = leaves.map((l) => {
        const e = empMap.get(l.employee_id);
        return {
          start_date: l.start_date,
          end_date: l.end_date,
          days: l.days,
          employee: e?.full_name ?? "",
          email: e?.email ?? "",
          department: e?.department_id ? deptMap.get(e.department_id) ?? "" : "",
          leave_type: ltMap.get(l.leave_type_id) ?? "",
          status: l.status,
        };
      });
      downloadCSV(`leave_${from}_to_${to}.csv`, toCSV(rows));
    }
    toast.success("Exported");
  }

  const statusVariant = (s: string) => {
    switch (s) {
      case "present":
      case "approved":
        return "default";
      case "late":
      case "half_day":
      case "pending":
        return "secondary";
      case "absent":
      case "rejected":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Reports"
        title="Reports & Exports"
        description="Filter attendance and leave data, then export to CSV."
      />

      <Card className="mb-6">
        <CardContent className="p-4 grid gap-3 md:grid-cols-5">
          <div>
            <Label className="text-xs">Report</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ReportKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="attendance">Attendance</SelectItem>
                <SelectItem value="leave">Leave</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Department</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={exportCSV} className="w-full" disabled={loading}>
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground">Total records</div>
              <div className="text-2xl font-display">
                {kind === "attendance" ? attendance.length : leaves.length}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground">Employees in scope</div>
              <div className="text-2xl font-display">{employees.length}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2 text-muted-foreground">
              <CalendarCheck className="h-4 w-4" />
              <span className="text-xs">Status breakdown</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(stats).map(([k, v]) => (
                <Badge key={k} variant="outline" className="text-xs">
                  {k}: {v}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            {kind === "attendance" ? "Attendance records" : "Leave requests"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : kind === "attendance" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendance.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No records in this range.
                    </TableCell>
                  </TableRow>
                ) : (
                  attendance.map((a) => {
                    const e = empMap.get(a.employee_id);
                    return (
                      <TableRow key={a.id}>
                        <TableCell>{format(parseISO(a.date), "MMM d, yyyy")}</TableCell>
                        <TableCell>{e?.full_name ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {e?.department_id ? deptMap.get(e.department_id) ?? "—" : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(a.status)} className="capitalize">
                            {a.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {a.check_in ? format(parseISO(a.check_in), "HH:mm") : "—"}
                        </TableCell>
                        <TableCell>
                          {a.check_out ? format(parseISO(a.check_out), "HH:mm") : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaves.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No requests in this range.
                    </TableCell>
                  </TableRow>
                ) : (
                  leaves.map((l) => {
                    const e = empMap.get(l.employee_id);
                    return (
                      <TableRow key={l.id}>
                        <TableCell>{format(parseISO(l.start_date), "MMM d, yyyy")}</TableCell>
                        <TableCell>{format(parseISO(l.end_date), "MMM d, yyyy")}</TableCell>
                        <TableCell>{l.days}</TableCell>
                        <TableCell>{e?.full_name ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {ltMap.get(l.leave_type_id) ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(l.status)} className="capitalize">
                            {l.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
}
