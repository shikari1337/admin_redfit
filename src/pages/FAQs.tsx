import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ChevronDown, ChevronUp, FolderOpen, GripVertical, HelpCircle, Loader2, Pencil, Plus, Search, Trash2,
} from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { faqsAPI, faqGroupsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';

/**
 * FAQs: the store's questions and answers, in FAQ groups (store data, `faq_groups`).
 *
 * v2: the staff list (`GET /api/v2/commerce/faqs`, every question, switched-off ones too) and the
 * FAQ group resource. The shop shows a question only when it is on AND its group is on; a product
 * can point at one group (Product form). Answers are plain text (line breaks kept).
 */

interface Faq {
  id: string;
  question: string;
  answer: string;
  faq_group_id: string | null;
  is_active: boolean;
  display_order: number;
}

interface FaqGroup {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  display_order: number;
}

/** Every row of a list answer (an array, or `{data: [...]}`). */
const rowsOf = (res: any): any[] =>
  Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : Array.isArray(res?.data?.data) ? res.data.data : [];

const toFaq = (r: any): Faq => ({
  id: String(r.id ?? r._id),
  question: String(r.question ?? ''),
  answer: String(r.answer ?? ''),
  faq_group_id: r.faq_group_id ?? r.faqGroupId ?? null,
  is_active: (r.is_active ?? r.isActive) !== false,
  display_order: Number(r.display_order ?? r.displayOrder ?? 0) || 0,
});

const toGroup = (r: any): FaqGroup => ({
  id: String(r.id ?? r._id),
  name: String(r.name ?? ''),
  description: r.description ?? null,
  is_active: (r.is_active ?? r.isActive) !== false,
  display_order: Number(r.display_order ?? r.displayOrder ?? 0) || 0,
});

const byOrder = <T extends { display_order: number }>(a: T, b: T) => a.display_order - b.display_order;

const errText = (err: any, fallback: string) => err?.response?.data?.message || err?.message || fallback;

/** The staff list, every page of it (the list answers at most 200 a page). */
async function loadAllFaqs(): Promise<Faq[]> {
  const out: Faq[] = [];
  for (let page = 0; page < 25; page += 1) {
    const rows = rowsOf(await faqsAPI.getAll({ limit: 200, offset: page * 200 }));
    out.push(...rows.map(toFaq));
    if (rows.length < 200) break;
  }
  return out;
}

const NO_GROUP = '__none__';
const ALL = '__all__';

type FaqForm = { id: string; question: string; answer: string; groupId: string; isActive: boolean };
const emptyFaqForm = (groupId = NO_GROUP): FaqForm => ({ id: '', question: '', answer: '', groupId, isActive: true });

type GroupForm = { id: string; name: string; description: string; isActive: boolean };
const emptyGroupForm: GroupForm = { id: '', name: '', description: '', isActive: true };

const FaqRow: React.FC<{
  faq: Faq;
  groupName: string | null;
  groupOff: boolean;
  open: boolean;
  draggable: boolean;
  canManage: boolean;
  canDelete: boolean;
  onToggleOpen: () => void;
  onToggleActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ faq, groupName, groupOff, open, draggable, canManage, canDelete, onToggleOpen, onToggleActive, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: faq.id, disabled: !draggable });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const hidden = !faq.is_active || groupOff;
  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border border-border bg-card">
      <div className="flex items-start gap-2 p-3 sm:gap-3">
        {draggable && (
          <button type="button" {...attributes} {...listeners} title="Drag to reorder"
            className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing">
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <button type="button" onClick={onToggleOpen} className="min-w-0 flex-1 text-left">
          <p className={`text-sm font-medium ${hidden ? 'text-muted-foreground' : 'text-foreground'}`}>{faq.question}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {groupName && <Badge variant="outline" className="text-[11px] font-normal">{groupName}</Badge>}
            {!faq.is_active && <Badge variant="secondary" className="text-[11px] font-normal">Off</Badge>}
            {faq.is_active && groupOff && <Badge variant="secondary" className="text-[11px] font-normal">Group off</Badge>}
          </div>
          {open && <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{faq.answer}</p>}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {canManage && (
            <Switch checked={faq.is_active} onCheckedChange={onToggleActive} aria-label={faq.is_active ? 'Shown on the shop' : 'Hidden from the shop'} />
          )}
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onToggleOpen} title={open ? 'Hide answer' : 'Show answer'}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          {canManage && (
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={onEdit} title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {canDelete && (
            <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10" onClick={onDelete} title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

const FAQs: React.FC = () => {
  const { hasPerm } = useAuth();
  // v2: content.manage writes, content.delete removes (commerce resources/catalog_mgmt.rs FAQS).
  const canManage = hasPerm('content.manage');
  const canDelete = hasPerm('content.delete');

  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [groups, setGroups] = useState<FaqGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<string>(ALL);
  const [onlyOff, setOnlyOff] = useState(false);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const [faqForm, setFaqForm] = useState<FaqForm | null>(null);
  const [faqError, setFaqError] = useState<string | null>(null);
  const [savingFaq, setSavingFaq] = useState(false);

  const [groupsOpen, setGroupsOpen] = useState(false);
  const [groupForm, setGroupForm] = useState<GroupForm>(emptyGroupForm);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [savingGroup, setSavingGroup] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [faqRows, groupRes] = await Promise.all([loadAllFaqs(), faqGroupsAPI.getAll()]);
      setFaqs(faqRows.sort(byOrder));
      setGroups(rowsOf(groupRes).map(toGroup).sort(byOrder));
    } catch (err: any) {
      setLoadError(errText(err, 'Could not load the FAQs.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const groupOff = (f: Faq) => Boolean(f.faq_group_id && groupById.get(f.faq_group_id)?.is_active === false);
  const onShop = (f: Faq) => f.is_active && !groupOff(f);

  const counts = useMemo(() => {
    const per = new Map<string, number>();
    let ungrouped = 0;
    for (const f of faqs) {
      if (f.faq_group_id && groupById.has(f.faq_group_id)) per.set(f.faq_group_id, (per.get(f.faq_group_id) ?? 0) + 1);
      else ungrouped += 1;
    }
    const live = faqs.filter((f) => f.is_active && !(f.faq_group_id && groupById.get(f.faq_group_id)?.is_active === false)).length;
    return { per, ungrouped, live, hidden: faqs.length - live };
  }, [faqs, groupById]);

  const term = search.trim().toLowerCase();
  const shown = useMemo(() => faqs.filter((f) => {
    if (view === NO_GROUP && f.faq_group_id && groupById.has(f.faq_group_id)) return false;
    if (view !== ALL && view !== NO_GROUP && f.faq_group_id !== view) return false;
    if (onlyOff && onShop(f)) return false;
    if (term && !`${f.question} ${f.answer}`.toLowerCase().includes(term)) return false;
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [faqs, view, onlyOff, term, groupById]);

  // Order is one number per question; dragging is offered on an unfiltered list only, so the
  // numbers written are the ones the shop reads.
  const draggable = canManage && !term && !onlyOff;

  /* ── questions ─────────────────────────────────────────────────────── */

  const openCreate = () => {
    setFaqError(null);
    setFaqForm(emptyFaqForm(view !== ALL && view !== NO_GROUP ? view : NO_GROUP));
  };
  const openEdit = (f: Faq) => {
    setFaqError(null);
    setFaqForm({ id: f.id, question: f.question, answer: f.answer, groupId: f.faq_group_id && groupById.has(f.faq_group_id) ? f.faq_group_id : NO_GROUP, isActive: f.is_active });
  };

  const saveFaq = async () => {
    if (!faqForm) return;
    const question = faqForm.question.trim();
    const answer = faqForm.answer.trim();
    if (!question || !answer) { setFaqError('Write both the question and its answer.'); return; }
    setSavingFaq(true);
    setFaqError(null);
    const body = {
      question,
      answer,
      faqGroupId: faqForm.groupId === NO_GROUP ? null : faqForm.groupId,
      isActive: faqForm.isActive,
    };
    try {
      if (faqForm.id) {
        await faqsAPI.update(faqForm.id, body);
        setFaqs((prev) => prev.map((f) => (f.id === faqForm.id
          ? { ...f, question, answer, faq_group_id: body.faqGroupId, is_active: body.isActive }
          : f)));
        toast({ title: 'Question saved' });
      } else {
        const next = faqs.reduce((m, f) => Math.max(m, f.display_order), -1) + 1;
        await faqsAPI.create({ ...body, displayOrder: next });
        setFaqs((await loadAllFaqs()).sort(byOrder));
        toast({ title: 'Question added' });
      }
      setFaqForm(null);
    } catch (err: any) {
      setFaqError(errText(err, 'Could not save the question.'));
    } finally {
      setSavingFaq(false);
    }
  };

  const toggleFaq = async (f: Faq) => {
    const next = !f.is_active;
    setFaqs((prev) => prev.map((x) => (x.id === f.id ? { ...x, is_active: next } : x)));
    try {
      await faqsAPI.update(f.id, { isActive: next });
    } catch (err: any) {
      setFaqs((prev) => prev.map((x) => (x.id === f.id ? { ...x, is_active: f.is_active } : x)));
      toast({ title: errText(err, 'Could not switch the question.'), variant: 'destructive' });
    }
  };

  const deleteFaq = async (f: Faq) => {
    if (!window.confirm(`Delete the question "${f.question}"? This cannot be undone.`)) return;
    try {
      await faqsAPI.delete(f.id);
      setFaqs((prev) => prev.filter((x) => x.id !== f.id));
      toast({ title: 'Question deleted' });
    } catch (err: any) {
      toast({ title: errText(err, 'Could not delete the question.'), variant: 'destructive' });
    }
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = shown.findIndex((f) => f.id === active.id);
    const to = shown.findIndex((f) => f.id === over.id);
    if (from < 0 || to < 0) return;
    // The dragged list keeps the order numbers it already held, handed out in the new order.
    const slots = shown.map((f) => f.display_order).sort((a, b) => a - b);
    const moved = arrayMove(shown, from, to);
    const used = new Set<number>();
    const renumbered = moved.map((f, i) => {
      let n = slots[i];
      while (used.has(n)) n += 1;
      used.add(n);
      return { ...f, display_order: n };
    });
    const changed = renumbered.filter((f) => f.display_order !== shown.find((s) => s.id === f.id)?.display_order);
    const map = new Map(renumbered.map((f) => [f.id, f.display_order]));
    setFaqs((prev) => prev.map((f) => (map.has(f.id) ? { ...f, display_order: map.get(f.id)! } : f)).sort(byOrder));
    try {
      await Promise.all(changed.map((f) => faqsAPI.update(f.id, { displayOrder: f.display_order })));
    } catch (err: any) {
      toast({ title: errText(err, 'Could not save the new order.'), variant: 'destructive' });
      load();
    }
  };

  /* ── groups ────────────────────────────────────────────────────────── */

  const saveGroup = async () => {
    const name = groupForm.name.trim();
    if (!name) { setGroupError('Give the group a name.'); return; }
    setSavingGroup(true);
    setGroupError(null);
    try {
      const description = groupForm.description.trim();
      if (groupForm.id) {
        await faqGroupsAPI.update(groupForm.id, { name, description, isActive: groupForm.isActive });
        setGroups((prev) => prev.map((g) => (g.id === groupForm.id ? { ...g, name, description } : g)));
      } else {
        const next = groups.reduce((m, g) => Math.max(m, g.display_order), -1) + 1;
        await faqGroupsAPI.create({ name, description: description || undefined, isActive: groupForm.isActive, displayOrder: next });
        setGroups(rowsOf(await faqGroupsAPI.getAll()).map(toGroup).sort(byOrder));
      }
      setGroupForm(emptyGroupForm);
    } catch (err: any) {
      setGroupError(errText(err, 'Could not save the group.'));
    } finally {
      setSavingGroup(false);
    }
  };

  const toggleGroup = async (g: FaqGroup) => {
    const next = !g.is_active;
    setGroups((prev) => prev.map((x) => (x.id === g.id ? { ...x, is_active: next } : x)));
    try {
      await faqGroupsAPI.update(g.id, { isActive: next });
    } catch (err: any) {
      setGroups((prev) => prev.map((x) => (x.id === g.id ? { ...x, is_active: g.is_active } : x)));
      setGroupError(errText(err, 'Could not switch the group.'));
    }
  };

  const deleteGroup = async (g: FaqGroup) => {
    if (!window.confirm(`Delete the group "${g.name}"?`)) return;
    try {
      await faqGroupsAPI.delete(g.id);
      setGroups((prev) => prev.filter((x) => x.id !== g.id));
      if (view === g.id) setView(ALL);
    } catch (err: any) {
      // A group a product still points at cannot go (409): say so in words.
      const status = err?.response?.status;
      setGroupError(status === 409
        ? `"${g.name}" is still used by a product. Pick another group on that product first, or switch this group off.`
        : errText(err, 'Could not delete the group.'));
    }
  };

  /* ── render ────────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">FAQs</h1>
        <div className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <span>{loadError}</span>
          <Button size="sm" variant="outline" onClick={load}>Try again</Button>
        </div>
      </div>
    );
  }

  const chip = (key: string, label: string, n: number, off = false) => (
    <button key={key} type="button" onClick={() => setView(key)}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
        view === key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted'
      }`}>
      <span className={off && view !== key ? 'text-muted-foreground line-through' : ''}>{label}</span>
      <span className={view === key ? 'opacity-80' : 'text-muted-foreground'}>{n}</span>
    </button>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">FAQs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Questions and answers for the shop's FAQ page, the home page block and product pages that use a group.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setGroupError(null); setGroupForm(emptyGroupForm); setGroupsOpen(true); }}>
            <FolderOpen className="mr-2 h-4 w-4" /> Groups
          </Button>
          {canManage && (
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add question</Button>
          )}
        </div>
      </div>

      {/* What to act on first, then the numbers. */}
      {counts.hidden > 0 && (
        <button type="button" onClick={() => { setOnlyOff((v) => !v); }}
          className="flex w-full items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {counts.hidden === 1 ? '1 question is' : `${counts.hidden} questions are`} hidden from the shop (switched off, or in a group that is off).
            <span className="ml-1 underline">{onlyOff ? 'Show all' : 'Show them'}</span>
          </span>
        </button>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xl font-semibold text-foreground">{counts.live}</p>
          <p className="text-xs text-muted-foreground">On the shop</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xl font-semibold text-foreground">{counts.hidden}</p>
          <p className="text-xs text-muted-foreground">Hidden</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xl font-semibold text-foreground">{groups.length}</p>
          <p className="text-xs text-muted-foreground">Groups</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {chip(ALL, 'All', faqs.length)}
          {groups.map((g) => chip(g.id, g.name, counts.per.get(g.id) ?? 0, !g.is_active))}
          {groups.length > 0 && counts.ungrouped > 0 && chip(NO_GROUP, 'No group', counts.ungrouped)}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions and answers" className="pl-9" />
        </div>
      </div>

      {faqs.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-border px-4 py-10 text-center">
          <HelpCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm font-medium text-foreground">No questions yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Add the questions shoppers ask most: delivery, payment, returns.</p>
          {canManage && <Button className="mt-4" size="sm" onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add question</Button>}
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-lg border border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing matches. {(term || onlyOff) && (
            <button type="button" className="underline" onClick={() => { setSearch(''); setOnlyOff(false); }}>Clear the search</button>
          )}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={shown.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {shown.map((f) => (
                <FaqRow
                  key={f.id}
                  faq={f}
                  groupName={view === ALL && f.faq_group_id ? groupById.get(f.faq_group_id)?.name ?? null : null}
                  groupOff={groupOff(f)}
                  open={openId === f.id}
                  draggable={draggable}
                  canManage={canManage}
                  canDelete={canDelete}
                  onToggleOpen={() => setOpenId(openId === f.id ? null : f.id)}
                  onToggleActive={() => toggleFaq(f)}
                  onEdit={() => openEdit(f)}
                  onDelete={() => deleteFaq(f)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      {draggable && shown.length > 1 && (
        <p className="text-xs text-muted-foreground">Drag a question by its handle to change the order the shop shows.</p>
      )}

      {/* One question */}
      <Dialog open={faqForm !== null} onOpenChange={(o) => { if (!o) setFaqForm(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{faqForm?.id ? 'Edit question' : 'Add question'}</DialogTitle>
            <DialogDescription>Shoppers read the answer as written; line breaks are kept.</DialogDescription>
          </DialogHeader>
          {faqForm && (
            <div className="space-y-4">
              {faqError && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{faqError}</p>}
              <div className="space-y-1.5">
                <Label htmlFor="faq-question">Question</Label>
                <Input id="faq-question" value={faqForm.question} maxLength={2000}
                  onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })} placeholder="How long does delivery take?" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="faq-answer">Answer</Label>
                <Textarea id="faq-answer" rows={6} value={faqForm.answer}
                  onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="faq-group">Group</Label>
                <select id="faq-group" value={faqForm.groupId}
                  onChange={(e) => setFaqForm({ ...faqForm, groupId: e.target.value })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
                  <option value={NO_GROUP}>No group</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}{g.is_active ? '' : ' (off)'}</option>
                  ))}
                </select>
                {groups.length === 0 && (
                  <p className="text-xs text-muted-foreground">Groups sort questions into sections (Delivery, Payment, Returns). Make them under Groups.</p>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Switch checked={faqForm.isActive} onCheckedChange={(v) => setFaqForm({ ...faqForm, isActive: v })} />
                Show on the shop
              </label>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setFaqForm(null)}>Cancel</Button>
            <Button onClick={saveFaq} disabled={savingFaq}>
              {savingFaq && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {faqForm?.id ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The groups */}
      <Dialog open={groupsOpen} onOpenChange={setGroupsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>FAQ groups</DialogTitle>
            <DialogDescription>
              A group is a section of questions. Switch a group off to hide all its questions from the shop; a product can show one group.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {groupError && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{groupError}</p>}
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No groups yet.</p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {groups.map((g) => {
                  const n = counts.per.get(g.id) ?? 0;
                  return (
                    <div key={g.id} className="flex items-center gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-medium ${g.is_active ? 'text-foreground' : 'text-muted-foreground'}`}>{g.name}</p>
                        <p className="text-xs text-muted-foreground">{n === 1 ? '1 question' : `${n} questions`}{g.is_active ? '' : ', hidden from the shop'}</p>
                      </div>
                      {canManage && <Switch checked={g.is_active} onCheckedChange={() => toggleGroup(g)} aria-label={g.is_active ? 'Group shown' : 'Group hidden'} />}
                      {canManage && (
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Rename"
                          onClick={() => { setGroupError(null); setGroupForm({ id: g.id, name: g.name, description: g.description ?? '', isActive: g.is_active }); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10" disabled={n > 0}
                          title={n > 0 ? 'Move or delete its questions first' : 'Delete'} onClick={() => deleteGroup(g)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {canManage && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-sm font-medium text-foreground">{groupForm.id ? 'Rename group' : 'New group'}</p>
                <Input value={groupForm.name} maxLength={255} placeholder="Delivery"
                  onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} />
                <Input value={groupForm.description} placeholder="Short note (optional)"
                  onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveGroup} disabled={savingGroup}>
                    {savingGroup && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    {groupForm.id ? 'Save' : 'Add group'}
                  </Button>
                  {groupForm.id && <Button size="sm" variant="outline" onClick={() => setGroupForm(emptyGroupForm)}>Cancel</Button>}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FAQs;
