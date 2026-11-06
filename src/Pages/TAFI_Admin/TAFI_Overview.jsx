import DashboardOverview from '../Dashboard_Overview'

export default function TafiOverview({
  noAvailableStockCount,
  isLoadingNoAvailableStockCount,
  noAvailableStockCountError,
  noPriceBarcodeCount,
  isLoadingNoPriceBarcodeCount,
  noPriceBarcodeCountError,
  pendingStockRequestBranches,
  isLoadingPendingStockRequests,
  pendingStockRequestsError
}) {
  return (
    <DashboardOverview
      roleName="TAFI Admin"
      showBarcodeWithoutPrice
      showPendingStockRequests
      noAvailableStockCount={noAvailableStockCount}
      isLoadingNoAvailableStockCount={isLoadingNoAvailableStockCount}
      noAvailableStockCountError={noAvailableStockCountError}
      noPriceBarcodeCount={noPriceBarcodeCount}
      isLoadingNoPriceBarcodeCount={isLoadingNoPriceBarcodeCount}
      noPriceBarcodeCountError={noPriceBarcodeCountError}
      pendingStockRequestBranches={pendingStockRequestBranches}
      isLoadingPendingStockRequests={isLoadingPendingStockRequests}
      pendingStockRequestsError={pendingStockRequestsError}
    />
  )
}
