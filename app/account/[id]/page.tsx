import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAccountDetails } from '@/lib/services/account'
import { Sensitive } from '@/components/sensitive-data'
import { Card, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function fmtAmount(amount: number, currency: string) {
  const cls = amount < 0 ? 'text-neg' : amount > 0 ? 'text-pos' : ''
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return (
    <span className={cls}>
      <Sensitive>
        {formatted} {currency}
      </Sensitive>
    </span>
  )
}

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const details = getAccountDetails(id)
  if (!details) notFound()

  const { account, connection, balances: accountBalances, transactions: accountTransactions } =
    details

  const title = account.details || account.product || account.name || account.iban || 'Account'

  return (
    <main className="mx-auto max-w-240 px-6 pb-16 pt-8">
      <p className="mt-0">
        <Link href="/">← back</Link>
      </p>
      <h1 className="mb-6 text-24 font-semibold">{title}</h1>

      <Card>
        <CardTitle>Details</CardTitle>
        {connection?.label && (
          <p className="my-1 text-sm text-muted-foreground">{connection.label}</p>
        )}
        {account.name && (
          <p className="my-1 text-sm text-muted-foreground">Holder: {account.name}</p>
        )}
        {account.product && (
          <p className="my-1 text-sm text-muted-foreground">Product: {account.product}</p>
        )}
        {account.iban && <p className="my-1 text-sm text-muted-foreground">IBAN: {account.iban}</p>}
        {account.bban && <p className="my-1 text-sm text-muted-foreground">BBAN: {account.bban}</p>}
        {account.bic && <p className="my-1 text-sm text-muted-foreground">BIC: {account.bic}</p>}
        {account.currency && (
          <p className="my-1 text-sm text-muted-foreground">Currency: {account.currency}</p>
        )}
        {account.accountType && (
          <p className="my-1 text-sm text-muted-foreground">Type: {account.accountType}</p>
        )}
      </Card>

      {accountBalances.length > 0 && (
        <Card>
          <CardTitle>Balances</CardTitle>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Reference date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accountBalances.map((b, i) => (
                <TableRow key={i}>
                  <TableCell>{b.balanceType}</TableCell>
                  <TableCell className="text-muted-foreground">{b.referenceDate ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {fmtAmount(b.amount, b.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card>
        <CardTitle>
          Transactions{' '}
          <span className="font-normal text-muted-foreground">({accountTransactions.length})</span>
        </CardTitle>
        {accountTransactions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No transactions stored yet — try Sync now.
          </p>
        )}
        {accountTransactions.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accountTransactions.map((t) => (
                <TableRow
                  key={t.fingerprint}
                  className={t.status && t.status !== 'BOOK' ? 'opacity-60' : ''}
                >
                  <TableCell>{t.date}</TableCell>
                  <TableCell>{t.description || t.counterparty || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{t.status || ''}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {fmtAmount(t.amount, t.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </main>
  )
}
