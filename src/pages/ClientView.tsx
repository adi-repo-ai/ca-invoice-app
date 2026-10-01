import type { DocumentSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { InvoiceTable } from '../components/InvoiceTable';
import { Alert, Button, Card, LinkButton, Loading, PageHeader, errorMessage } from '../components/ui';
import { getClient, type ClientRow } from '../data/clients';
import { listInvoices, type InvoiceRow } from '../data/invoices';
import { db } from '../firebase';

export default function ClientView() {
  const { id } = useParams();
  const [client, setClient] = useState<ClientRow | null>(null);
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);
  const [cursor, setCursor] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getClient(db, id)
      .then((c) => (c ? setClient(c) : setError('Client not found')))
      .catch((e) => setError(errorMessage(e)));
    listInvoices(db, { clientId: id }, null)
      .then((r) => {
        setRows(r.rows);
        setCursor(r.last);
        setHasMore(r.hasMore);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  async function more() {
    const r = await listInvoices(db, { clientId: id }, cursor);
    setRows((p) => [...(p ?? []), ...r.rows]);
    setCursor(r.last);
    setHasMore(r.hasMore);
  }

  if (error) return <Alert>{error}</Alert>;
  if (!client) return <Loading />;
  const line = (label: string, value: string) =>
    value ? (
      <div>
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="whitespace-pre-line text-sm">{value}</dd>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={client.name}
        actions={
          <>
            <LinkButton variant="secondary" to={`/clients/${client.id}/edit`}>
              Edit
            </LinkButton>
            <LinkButton to={`/invoices/new?client=${client.id}`}>New invoice</LinkButton>
          </>
        }
      />
      <Card>
        <dl className="grid gap-3 sm:grid-cols-3">
          {line('Contact person', client.contactPerson)}
          {line('Email', client.email)}
          {line('WhatsApp', client.whatsapp ? `+${client.whatsapp}` : '')}
          {line('State', `${client.stateName} (${client.stateCode})`)}
          {line('GSTIN', client.gstin)}
          {line('PAN', client.pan)}
          {line('Billing address', client.address)}
        </dl>
      </Card>
      <Card title="Invoice history">
        {!rows ? <Loading /> : <InvoiceTable rows={rows} showClient={false} />}
        {hasMore && (
          <div className="mt-3 text-center">
            <Button variant="secondary" onClick={more}>
              Load more
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
