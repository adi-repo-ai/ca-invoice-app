import type { ClientInput } from '../data/clients';
import { INDIAN_STATES, STATES_BY_NAME } from '../lib/states';
import type { validateClient } from '../pages/ClientEdit';
import { Field } from './ui';

/** Client details typed directly on the invoice (saved to the list or used once). */
export function ClientFields({
  value: c,
  onChange,
  errors,
}: {
  value: ClientInput;
  onChange: (c: ClientInput) => void;
  errors: ReturnType<typeof validateClient>;
}) {
  const set = (k: keyof ClientInput, v: string) => onChange({ ...c, [k]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Client name *" error={errors.name}>
        <input value={c.name} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <Field label="State *" error={errors.stateCode} hint="Decides CGST + SGST or IGST.">
        <select
          value={c.stateCode}
          onChange={(e) => {
            const st = INDIAN_STATES.find((s) => s.code === e.target.value);
            onChange({ ...c, stateCode: st?.code ?? '', stateName: st?.name ?? '' });
          }}
        >
          <option value="">Select state…</option>
          {STATES_BY_NAME.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Email" error={errors.email}>
        <input type="email" value={c.email} onChange={(e) => set('email', e.target.value)} />
      </Field>
      <Field label="WhatsApp number" error={errors.whatsapp}>
        <input type="tel" value={c.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
      </Field>
      <Field label="Address" className="sm:col-span-2">
        <textarea rows={2} value={c.address} onChange={(e) => set('address', e.target.value)} />
      </Field>
      <Field label="GSTIN (optional)" error={errors.gstin}>
        <input value={c.gstin} maxLength={15} onChange={(e) => set('gstin', e.target.value.toUpperCase().trim())} />
      </Field>
      <Field label="Contact person (optional)">
        <input value={c.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} />
      </Field>
    </div>
  );
}
