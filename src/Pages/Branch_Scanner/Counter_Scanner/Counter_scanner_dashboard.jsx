import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, RefreshCw, ScanLine } from 'lucide-react'
import {
  listBranchInventoryRef,
  revokeBranchAdminSession,
  scanBranchInventoryIn,
  scanBranchInventoryOut
} from '../../../lib/supabase'
import useRoleSessionExpiry from '../../../lib/useRoleSessionExpiry'
import logoImage from '../../../images/Tafi logo transparent.png'

const scannerSessionStorageKey = 'tafi-counter-scanner-session'

export default function CounterScannerDashboard() {
  const location = useLocation()
  const navigate = useNavigate()
  const [barcodeInput, setBarcodeInput] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [scanDirection, setScanDirection] = useState('out')
  const [lastScan, setLastScan] = useState(null)
  const [scanStatus, setScanStatus] = useState('Ready for barcode scans.')
  const [scanStatusIsError, setScanStatusIsError] = useState(false)
  const [isProcessingScan, setIsProcessingScan] = useState(false)
  const [refInventoryItems, setRefInventoryItems] = useState([])
  const [isLoadingRefInventory, setIsLoadingRefInventory] = useState(true)
  const [refInventoryError, setRefInventoryError] = useState('')
  const [refInventoryRefresh, setRefInventoryRefresh] = useState(0)
  const barcodeInputRef = useRef(null)
  const [branchAdmin] = useState(() => {
    if (location.state?.branchAdmin) return location.state.branchAdmin
    try {
      return JSON.parse(window.sessionStorage.getItem(scannerSessionStorageKey) || 'null')
    } catch (error) {
      console.error('Unable to load the Counter Scanner session.', error)
      return null
    }
  })
  const isSessionActive = useRoleSessionExpiry(
    branchAdmin,
    '/counter-scanner-login',
    scannerSessionStorageKey
  )

  useEffect(() => {
    if (!isProcessingScan) barcodeInputRef.current?.focus()
  }, [isProcessingScan])

  useEffect(() => {
    let isCurrent = true
    const loadRefInventory = async () => {
      setIsLoadingRefInventory(true)
      setRefInventoryError('')
      const { data, error } = await listBranchInventoryRef(branchAdmin?.session_token)
      if (!isCurrent) return
      setIsLoadingRefInventory(false)
      if (error) {
        setRefInventoryError(error.message)
        return
      }
      setRefInventoryItems(data ?? [])
    }

    loadRefInventory()
    return () => {
      isCurrent = false
    }
  }, [branchAdmin?.session_token, refInventoryRefresh])

  const handleScanSubmit = async (event) => {
    event.preventDefault()
    const barcode = barcodeInput.trim()
    if (!barcode) {
      setScanStatus('No barcode received. Scan an item or enter a code.')
      setScanStatusIsError(true)
      barcodeInputRef.current?.focus()
      return
    }
    const quantityToProcess = Number(quantity)
    if (!Number.isSafeInteger(quantityToProcess) || quantityToProcess <= 0) {
      setScanStatus('Enter a whole-number quantity greater than zero.')
      setScanStatusIsError(true)
      return
    }
    if (isProcessingScan) return

    setIsProcessingScan(true)
    setScanStatus(`Recording stock ${scanDirection}…`)
    setScanStatusIsError(false)
    const scanInventory = scanDirection === 'in' ? scanBranchInventoryIn : scanBranchInventoryOut
    const { data, error } = await scanInventory(
      branchAdmin.session_token,
      barcode,
      quantityToProcess
    )
    setIsProcessingScan(false)

    if (error) {
      setScanStatus(error.message)
      setScanStatusIsError(true)
      barcodeInputRef.current?.focus()
      return
    }
    const result = data?.[0]
    if (!result) {
      setScanStatus('No stock confirmation was returned. Check the item before scanning again.')
      setScanStatusIsError(true)
      barcodeInputRef.current?.focus()
      return
    }

    setLastScan(result)
    setBarcodeInput('')
    const quantityChanged = Number(scanDirection === 'in' ? result.quantity_in : result.quantity_out)
    if (scanDirection === 'in') {
      setScanStatus(
        `Transferred ${quantityChanged.toLocaleString()} ${result.unit_of_measure} from Main Inventory to Ref Inventory. Main available: ${Number(result.main_remaining_quantity).toLocaleString()}; Ref available: ${Number(result.remaining_quantity).toLocaleString()}.`
      )
    } else {
      setScanStatus(
        `Removed ${quantityChanged.toLocaleString()} ${result.unit_of_measure} from Ref Inventory. Ref available: ${Number(result.remaining_quantity).toLocaleString()}.`
      )
    }
    setScanStatusIsError(false)
    setRefInventoryRefresh((count) => count + 1)
    barcodeInputRef.current?.focus()
  }

  const handleLogout = () => {
    try {
      window.sessionStorage.removeItem(scannerSessionStorageKey)
    } catch (error) {
      console.error('Unable to clear the Counter Scanner session.', error)
    }

    if (branchAdmin?.session_token) {
      revokeBranchAdminSession(branchAdmin.session_token).then(({ error }) => {
        if (error) console.error('Unable to revoke the Counter Scanner session.', error)
      })
    }
    navigate('/counter-scanner-login', { replace: true })
  }

  if (!isSessionActive) return <Navigate to="/counter-scanner-login" replace />

  return (
    <main className="counter-scanner-dashboard">
      <section className="counter-scanner-card">
        <header className="counter-scanner-header">
          <img src={logoImage} alt="Triton ACCE Food Inc. logo" />
          <button type="button" className="counter-scanner-logout" onClick={handleLogout}>
            <LogOut size={17} aria-hidden="true" />
            Sign out
          </button>
        </header>
        <div className="counter-scanner-content">
          <p className="employee-info-eyebrow">{branchAdmin?.branch_name || 'Branch'}</p>
          <h1>Counter Scanner</h1>
          <p className="counter-scanner-signed-in">
            Signed in as {branchAdmin?.admin_name || branchAdmin?.admin_email}.
          </p>
          <div className="counter-scanner-ready">
            <ScanLine size={22} aria-hidden="true" />
            <div>
              <strong>Signed in successfully</strong>
              <p>Your branch Counter Scanner workspace is ready.</p>
            </div>
          </div>
          <section className="counter-scanner-input-section" aria-labelledby="counter-scanner-input-title">
            <h2 id="counter-scanner-input-title">Inventory scanning</h2>
            <p>
              Choose whether the scan adds or removes stock. Enter a quantity, then scan the item barcode.
              The scanner must send Enter after each scan to submit automatically.
            </p>
            <div className="counter-scanner-direction-tabs" role="group" aria-label="Stock scan direction">
              <button
                type="button"
                className={scanDirection === 'in' ? 'active' : ''}
                aria-pressed={scanDirection === 'in'}
                onClick={() => setScanDirection('in')}
                disabled={isProcessingScan}
              >
                Scanning In
              </button>
              <button
                type="button"
                className={scanDirection === 'out' ? 'active' : ''}
                aria-pressed={scanDirection === 'out'}
                onClick={() => setScanDirection('out')}
                disabled={isProcessingScan}
              >
                Scanning Out
              </button>
            </div>
            <form className="counter-scanner-input-form" onSubmit={handleScanSubmit}>
              <label htmlFor="counter-scanner-quantity">
                Quantity to {scanDirection === 'in' ? 'add' : 'remove'}
              </label>
              <input
                id="counter-scanner-quantity"
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                disabled={isProcessingScan}
              />
              <label htmlFor="counter-scanner-barcode">Barcode input</label>
              <div>
                <input
                  ref={barcodeInputRef}
                  id="counter-scanner-barcode"
                  type="text"
                  value={barcodeInput}
                  onChange={(event) => setBarcodeInput(event.target.value)}
                  placeholder="Click here, then scan a barcode"
                  autoComplete="off"
                  autoFocus
                  disabled={isProcessingScan}
                />
                <button type="submit" disabled={isProcessingScan}>
                  {isProcessingScan ? 'Recording…' : `Stock ${scanDirection}`}
                </button>
              </div>
            </form>
            <p
              className={`counter-scanner-input-status${scanStatusIsError ? ' is-error' : ''}`}
              role={scanStatusIsError ? 'alert' : 'status'}
              aria-live="polite"
            >
              Input status: {scanStatus}
            </p>
            {lastScan && (
              <p className="counter-scanner-last-scan">
                Last scan: <strong>{lastScan.barcode}</strong>
                <br />
                {lastScan.stock_no} — {lastScan.item_description}
                <br />
                {lastScan.quantity_in != null ? (
                  <>
                    Transferred {Number(lastScan.quantity_in).toLocaleString()} {lastScan.unit_of_measure} from Main to Ref.
                    <br />
                    Main available: {Number(lastScan.main_remaining_quantity).toLocaleString()}; Ref available:{' '}
                    {Number(lastScan.remaining_quantity).toLocaleString()} {lastScan.unit_of_measure}.
                  </>
                ) : (
                  <>
                    Removed {Number(lastScan.quantity_out).toLocaleString()} {lastScan.unit_of_measure} from Ref.
                    <br />
                    Ref available: {Number(lastScan.remaining_quantity).toLocaleString()} {lastScan.unit_of_measure}.
                  </>
                )}
              </p>
            )}
            <p className="counter-scanner-input-note">
              Assign each barcode to an item in Branch Admin → Branch Inventory → Ref Inventory first.
              Scanning in transfers quantity from Main Inventory to Ref Inventory. Scanning out reduces only Ref Inventory.
            </p>
          </section>
          <section className="counter-scanner-ref-section" aria-labelledby="counter-scanner-ref-title">
            <div className="counter-scanner-ref-heading">
              <div>
                <h2 id="counter-scanner-ref-title">Ref Inventory</h2>
                <p>Counter stock on hand, separate from Main Inventory.</p>
              </div>
              <button
                type="button"
                className="counter-scanner-refresh"
                onClick={() => setRefInventoryRefresh((count) => count + 1)}
                disabled={isLoadingRefInventory}
                aria-label="Refresh Ref Inventory"
              >
                <RefreshCw size={16} aria-hidden="true" />
                {isLoadingRefInventory ? 'Loading…' : 'Refresh'}
              </button>
            </div>
            {refInventoryError && <p className="counter-scanner-ref-error" role="alert">{refInventoryError}</p>}
            {isLoadingRefInventory ? (
              <p className="counter-scanner-ref-empty" role="status">Loading Ref Inventory…</p>
            ) : refInventoryItems.length ? (
              <div className="counter-scanner-ref-table-wrap">
                <table className="counter-scanner-ref-table">
                  <thead>
                    <tr>
                      <th scope="col">Stock no.</th>
                      <th scope="col">Description</th>
                      <th scope="col">Barcode</th>
                      <th scope="col">Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refInventoryItems.map((item) => (
                      <tr key={item.stock_inventory_id}>
                        <td>{item.stock_no}</td>
                        <td>{item.item_description}</td>
                        <td>{item.barcode || 'Not assigned'}</td>
                        <td>{Number(item.available).toLocaleString()} {item.unit_of_measure}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="counter-scanner-ref-empty">
                No Ref Inventory items are set up for this branch yet. Add items and assign barcodes in Branch Admin.
              </p>
            )}
          </section>
          <Link to="/" className="counter-scanner-home-link">Back to workspace selection</Link>
        </div>
      </section>
    </main>
  )
}