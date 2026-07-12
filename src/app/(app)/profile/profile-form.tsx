"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

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
import { updateProfile } from "./actions";

const NONE = "__none__";

export function ProfileForm({
  departments,
  name: initialName,
  phone: initialPhone,
  department: initialDepartment,
  level: initialLevel,
}: {
  departments: string[];
  name: string;
  phone: string | null;
  department: string | null;
  level: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [department, setDepartment] = useState(initialDepartment ?? NONE);
  const [level, setLevel] = useState(initialLevel ?? "");

  function submit() {
    startTransition(async () => {
      const result = await updateProfile({
        name,
        phone,
        department: department === NONE ? "" : department,
        level,
      });
      if (result.ok) {
        toast.success("Profile updated.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Full name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="department">Department</Label>
          <Select value={department} onValueChange={(v) => v && setDepartment(v)}>
            <SelectTrigger id="department">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="level">Level</Label>
          <Input
            id="level"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            placeholder="e.g. 300"
          />
        </div>
      </div>
      <Button onClick={submit} disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </div>
  );
}
