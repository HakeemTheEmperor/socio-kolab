"use client";

import { useState } from "react";
import { nanoid } from "nanoid";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlignLeft,
  ChevronDown,
  GripVertical,
  Hash,
  List,
  Lock,
  Plus,
  SquareCheck,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  FIELD_TYPES,
  LABEL_MAX,
  MAX_FIELDS,
  MAX_OPTIONS,
  OPTION_MAX,
  type FieldType,
  type FormField,
} from "@/lib/event-forms";

const TYPE_META: Record<FieldType, { label: string; icon: LucideIcon }> = {
  text: { label: "Short text", icon: Type },
  textarea: { label: "Paragraph", icon: AlignLeft },
  number: { label: "Number", icon: Hash },
  checkbox: { label: "Checkbox", icon: SquareCheck },
  select: { label: "Dropdown", icon: List },
};

function newField(type: FieldType): FormField {
  return {
    id: nanoid(),
    type,
    label: "Untitled question",
    required: false,
    ...(type === "select" ? { options: ["Option 1"] } : {}),
  };
}

/**
 * The drag-and-drop registration-form builder (EVENT-FORMS.md §2.2). Controlled
 * by the surrounding event dialog, which owns the field array and saves it
 * atomically with the event — there is no separate save flow here.
 *
 * Field ids are minted with nanoid on add and NEVER regenerated, so responses
 * (keyed by id) stay readable across renames and reorders. Reordering only
 * moves array elements; renaming/deleting only edits/removes them.
 */
export function FormBuilder({
  fields,
  onChange,
}: {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
}) {
  const [addedId, setAddedId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const labelOf = (id: UniqueIdentifier) =>
    fields.find((f) => f.id === id)?.label || "field";

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${labelOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${labelOf(active.id)} was moved over ${labelOf(over.id)}.`
        : `${labelOf(active.id)} is no longer over a drop target.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${labelOf(active.id)} was dropped onto ${labelOf(over.id)}.`
        : `${labelOf(active.id)} was dropped.`,
    onDragCancel: ({ active }) =>
      `Reordering cancelled. ${labelOf(active.id)} returned to its place.`,
  };

  function update(id: string, patch: Partial<FormField>) {
    onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }
  function remove(id: string) {
    onChange(fields.filter((f) => f.id !== id));
  }
  function add(type: FieldType) {
    if (fields.length >= MAX_FIELDS) return;
    const field = newField(type);
    setAddedId(field.id);
    onChange([...fields, field]);
  }
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = fields.findIndex((f) => f.id === active.id);
    const to = fields.findIndex((f) => f.id === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(fields, from, to));
  }

  return (
    <div className="space-y-3">
      {/* Pinned core fields — never draggable, deletable, or editable. */}
      <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Lock aria-hidden className="size-3.5" />
          Always included
        </div>
        <div className="space-y-1.5">
          {["Name", "Email"].map((label) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-md bg-surface px-3 py-2 text-sm"
            >
              <span className="font-medium">{label}</span>
              <span className="text-xs text-muted-foreground">· required</span>
            </div>
          ))}
        </div>
      </div>

      {fields.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{ announcements }}
        >
          <SortableContext
            items={fields.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {fields.map((field) => (
                <FieldRow
                  key={field.id}
                  field={field}
                  autoFocus={field.id === addedId}
                  onUpdate={update}
                  onRemove={remove}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">
          No custom questions yet. Registrants answer only Name and Email.
        </p>
      )}

      <div className="flex items-center justify-between">
        <AddFieldMenu disabled={fields.length >= MAX_FIELDS} onAdd={add} />
        <span className="text-xs text-muted-foreground">
          {fields.length}/{MAX_FIELDS} fields
        </span>
      </div>
    </div>
  );
}

function AddFieldMenu({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (type: FieldType) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="outline" size="sm" disabled={disabled} />}
      >
        <Plus aria-hidden className="size-4" />
        Add field
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {FIELD_TYPES.map((type) => {
          const { label, icon: Icon } = TYPE_META[type];
          return (
            <DropdownMenuItem
              key={type}
              render={<button type="button" onClick={() => onAdd(type)} />}
            >
              <Icon aria-hidden className="size-4" />
              {label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FieldRow({
  field,
  autoFocus,
  onUpdate,
  onRemove,
}: {
  field: FormField;
  autoFocus: boolean;
  onUpdate: (id: string, patch: Partial<FormField>) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id });
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { icon: Icon, label: typeLabel } = TYPE_META[field.type];

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-lg border border-border bg-surface",
        isDragging && "relative z-10 shadow-lg",
      )}
    >
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          aria-label={`Reorder ${field.label}`}
          className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden className="size-4" />
        </button>

        <span
          title={typeLabel}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        >
          <Icon aria-hidden className="size-3.5" />
          <span className="sr-only">{typeLabel}</span>
        </span>

        <Input
          aria-label="Field label"
          value={field.label}
          maxLength={LABEL_MAX}
          autoFocus={autoFocus}
          onChange={(e) => onUpdate(field.id, { label: e.target.value })}
          className="h-8 flex-1"
        />

        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Switch
            size="sm"
            checked={field.required}
            onCheckedChange={(checked) => onUpdate(field.id, { required: checked })}
          />
          <span className="hidden sm:inline">Required</span>
        </label>

        {field.type === "select" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`${optionsOpen ? "Hide" : "Edit"} options for ${field.label}`}
            aria-expanded={optionsOpen}
            onClick={() => setOptionsOpen((o) => !o)}
          >
            <ChevronDown
              aria-hidden
              className={cn("size-4 transition-transform", optionsOpen && "rotate-180")}
            />
          </Button>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${field.label}`}
          onClick={() => setConfirming(true)}
        >
          <Trash2 aria-hidden className="size-4" />
        </Button>
      </div>

      {field.type === "select" && optionsOpen ? (
        <OptionsEditor field={field} onUpdate={onUpdate} />
      ) : null}

      {confirming ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40 px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            Delete this field? Answers already collected are kept and shown as
            &ldquo;(removed field)&rdquo;.
          </span>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => onRemove(field.id)}
            >
              Delete
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function OptionsEditor({
  field,
  onUpdate,
}: {
  field: FormField;
  onUpdate: (id: string, patch: Partial<FormField>) => void;
}) {
  const options = field.options ?? [];

  function setOption(index: number, value: string) {
    onUpdate(field.id, {
      options: options.map((o, i) => (i === index ? value : o)),
    });
  }
  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    onUpdate(field.id, { options: [...options, `Option ${options.length + 1}`] });
  }
  function removeOption(index: number) {
    if (options.length <= 1) return; // at least one option always
    onUpdate(field.id, { options: options.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-2 border-t border-border bg-muted/30 p-3">
      <p className="text-xs font-medium text-muted-foreground">Options</p>
      {options.map((option, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            aria-label={`Option ${i + 1}`}
            value={option}
            maxLength={OPTION_MAX}
            onChange={(e) => setOption(i, e.target.value)}
            className="h-8"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove option ${i + 1}`}
            disabled={options.length <= 1}
            onClick={() => removeOption(i)}
          >
            <X aria-hidden className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={options.length >= MAX_OPTIONS}
        onClick={addOption}
      >
        <Plus aria-hidden className="size-4" />
        Add option
      </Button>
    </div>
  );
}
