import OperationsShell from '../../../../components/operations-shell';
export default async function AccountPaymentsPage({ params }: { params: Promise<{ riderId: string }> }) {
  const { riderId } = await params;
  return <OperationsShell paymentPage paymentRiderId={riderId} />;
}
