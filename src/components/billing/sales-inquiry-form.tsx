'use client';

import { useState } from 'react';
import { SendIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function SalesInquiryForm() {
  const [organizationName, setOrganizationName] = useState('');
  const [seats, setSeats] = useState('10');
  const [timeline, setTimeline] = useState('this-quarter');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submitInquiry(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch('/api/v1/billing/sales-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: organizationName.trim(),
          seats,
          timeline,
          message: message.trim() || null,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error =
          typeof body?.error === 'string'
            ? body.error
            : body?.error?.message ?? 'Could not send sales inquiry';
        throw new Error(error);
      }

      toast.success('Team inquiry sent');
      setOrganizationName('');
      setSeats('10');
      setTimeline('this-quarter');
      setMessage('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send sales inquiry');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitInquiry} className="grid gap-4 md:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="sales-org">Organization</Label>
        <Input
          id="sales-org"
          value={organizationName}
          onChange={(event) => setOrganizationName(event.target.value)}
          placeholder="Research Lab or Department"
          maxLength={255}
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sales-seats">Seats</Label>
        <Input
          id="sales-seats"
          type="number"
          min={2}
          max={10000}
          value={seats}
          onChange={(event) => setSeats(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label>Timeline</Label>
        <Select value={timeline} onValueChange={(value) => value && setTimeline(value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this-month">This month</SelectItem>
            <SelectItem value="this-quarter">This quarter</SelectItem>
            <SelectItem value="planning">Still planning</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5 md:row-span-2">
        <Label htmlFor="sales-message">Procurement notes</Label>
        <Textarea
          id="sales-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Security review, invoice needs, SSO timing, or support requirements"
          maxLength={2000}
          rows={5}
        />
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={submitting || !organizationName.trim()} className="w-full md:w-fit">
          <SendIcon className="mr-1.5 size-4" />
          {submitting ? 'Sending...' : 'Send Team Inquiry'}
        </Button>
      </div>
    </form>
  );
}
