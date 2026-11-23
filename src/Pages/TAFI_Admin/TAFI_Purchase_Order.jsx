import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Plus, Trash2 } from 'lucide-react'
import { listTafiAdminInventoryInformation } from '../../lib/supabase'
import { downloadTafiPurchaseOrder } from './tafiPurchaseOrderXlsxExport'

const createPurchaseOrderItem = (id) => ({
  id,
  inventoryId: '',
  quantity: '',
  unit: '',
  unitPrice: ''
})

const getLocalDateKey = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const roundAmount = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100

const formatCurrency = (amount) => Number(amount).toLocaleString('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const isValidAmount = (value) => /^\d{1,10}(?:\.\d{1,2})?$/.test(value)
  && Number.isFinite(Number(value))
  && Number(value) >= 0

const getItemTotal = (item) => {
  const quantity = Number(item.quantity)
  const unitPrice = Number(item.unitPrice)
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return 0
  return roundAmount(quantity * unitPrice)
}

export default function TafiPurchaseOrder({ sessionToken }) {
  const [inventoryItems, setInventoryItems] = useState([])
  const [isLoadingInventory, setIsLoadingInventory] = useState(true)
  const [inventoryError, setInventoryError] = useState('')
  const [form, setForm] = useState(() => ({
    supplier: '',
    poNumber: '',
    poDate: getLocalDateKey(),
    paymentTerms: '7 days',
    promiseDate: '',
    remarks: '',
    subtotal: '',
    discount: '',
    vat: '',
    tax: ''
  }))
  const [items, setItems] = useState([createPurchaseOrderItem(0)])
  const nextItemId = useRef(1)
  const [isDownloading, setIsDownloading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')

  const suppliers = useMemo(() => [...new Set(
    inventoryItems.map((item) => item.supplier?.trim()).filter(Boolean)
  )].sort((first, second) => first.localeCompare(second)), [inventoryItems])
  const supplierItems = useMemo(
    () => inventoryItems.filter((item) => item.supplier?.trim() === form.supplier),
    [form.supplier, inventoryItems]
  )

  useEffect(() => {
    let isCurrent = true
    const loadInventory = async () => {
      if (!sessionToken) {
        setIsLoadingInventory(false)
        setInventoryError('Your TAFI Admin session is missing. Sign in again to load shared inventory.')
        return
      }

      const { data, error } = await listTafiAdminInventoryInformation(sessionToken)
      if (!isCurrent) return
      setIsLoadingInventory(false)
      if (error) {
        setInventoryError(error.message)
        return
      }
      setInventoryError('')
      setInventoryItems(data ?? [])
    }

    void loadInventory()
    return () => {
      isCurrent = false
    }
  }, [sessionToken])

  const subtotal = Number(form.subtotal) || 0
  const discount = Number(form.discount) || 0
  const vat = Number(form.vat) || 0
  const tax = Number(form.tax) || 0
  const totalCost = roundAmount(subtotal - discount + vat + tax)

  const handleFieldChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleSupplierChange = (event) => {
    setForm((current) => ({ ...current, supplier: event.target.value }))
    setItems((current) => current.map((item) => ({
      ...item,
      inventoryId: '',
      unit: ''
    })))
  }

  const handleItemChange = (itemId, field, value) => {
    setItems((current) => current.map((item) => (
      item.id === itemId ? { ...item, [field]: value } : item
    )))
  }

  const handleInventoryItemChange = (itemId, inventoryId) => {
    const inventoryItem = supplierItems.find((item) => item.inventory_id === inventoryId)
    setItems((current) => current.map((item) => (
      item.id === itemId
        ? {
          ...item,
          inventoryId,
          unit: inventoryItem?.unit_of_measure ?? ''
        }
        : item
    )))
  }

  const addItem = () => {
    const id = nextItemId.current
    nextItemId.current += 1
    setItems((current) => [...current, createPurchaseOrderItem(id)])
  }

  const removeItem = (itemId) => {
    setItems((current) => current.length > 1
      ? current.filter((item) => item.id !== itemId)
      : current)
  }

  const handleDownload = async (event) => {
    event.preventDefault()
    setErrorMessage('')
    setNotice('')

    if (!form.supplier || !form.poNumber.trim() || !form.poDate || !form.promiseDate) {
      setErrorMessage('Complete the supplier and purchase order details before downloading.')
      return
    }
    if (items.some((item) => (
      !item.inventoryId
      || !item.quantity
      || !Number.isFinite(Number(item.quantity))
      || Number(item.quantity) <= 0
      || !item.unit.trim()
      || !isValidAmount(item.unitPrice)
    ))) {
      setErrorMessage('Choose a shared-inventory item and enter a valid quantity, unit, and unit price for every line.')
      return
    }
    if (![form.subtotal, form.discount, form.vat, form.tax].every(isValidAmount)) {
      setErrorMessage('Enter Subtotal, Discount, VAT, and Tax as non-negative amounts with up to two decimal places.')
      return
    }
    if (discount > subtotal) {
      setErrorMessage('Discount cannot be greater than the Subtotal.')
      return
    }

    const purchaseOrderItems = items.map((item) => {
      const inventoryItem = supplierItems.find((entry) => entry.inventory_id === item.inventoryId)
      return {
        description: inventoryItem?.item_description ?? '',
        quantity: Number(item.quantity),
        unit: item.unit.trim(),
        unitPrice: Number(item.unitPrice)
      }
    })

    setIsDownloading(true)
    try {
      const fileName = await downloadTafiPurchaseOrder({
        ...form,
        poNumber: form.poNumber.trim(),
        remarks: form.remarks.trim(),
        subtotal,
        discount,
        vat,
        tax,
        totalCost,
        items: purchaseOrderItems
      })
      setNotice(`Downloaded ${fileName}.`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to prepare the Purchase Order workbook.')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <section className="tafi-purchase-order-page">
      <header className="tafi-purchase-order-header">
        <div>
          <p className="eyebrow">TAFI Admin workspace</p>
          <h2>Purchase Order</h2>
          <p>Create a purchase order using supplier and item information from shared inventory.</p>
        </div>
      </header>

      {isLoadingInventory && <p className="tafi-purchase-order-message" role="status">Loading shared inventory...</p>}
      {inventoryError && <p className="tafi-purchase-order-message error" role="alert">{inventoryError}</p>}
      {errorMessage && <p className="tafi-purchase-order-message error" role="alert">{errorMessage}</p>}
      {notice && <p className="tafi-purchase-order-message" role="status">{notice}</p>}

      {!isLoadingInventory && !inventoryError && suppliers.length === 0 && (
        <p className="tafi-purchase-order-message" role="status">
          Add supplier details to Shared Inventory Information before creating a purchase order.
        </p>
      )}

      <form className="tafi-purchase-order-form" onSubmit={handleDownload}>
        <section className="tafi-purchase-order-panel" aria-labelledby="tafi-purchase-order-details">
          <h3 id="tafi-purchase-order-details">Purchase order details</h3>
          <div className="tafi-purchase-order-fields">
            <label>
              <span>Supplier</span>
              <select
                name="supplier"
                value={form.supplier}
                onChange={handleSupplierChange}
                disabled={isLoadingInventory || Boolean(inventoryError) || suppliers.length === 0 || isDownloading}
                required
              >
                <option value="">Select a supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier} value={supplier}>{supplier}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Purchase order no.</span>
              <input
                name="poNumber"
                value={form.poNumber}
                onChange={handleFieldChange}
                maxLength="60"
                required
                disabled={isDownloading}
              />
            </label>
            <label>
              <span>P.O. Date</span>
              <input
                type="date"
                name="poDate"
                value={form.poDate}
                onChange={handleFieldChange}
                required
                disabled={isDownloading}
              />
            </label>
            <label>
              <span>Payment terms</span>
              <select
                name="paymentTerms"
                value={form.paymentTerms}
                onChange={handleFieldChange}
                disabled={isDownloading}
                required
              >
                <option value="7 days">7 days</option>
                <option value="15 days">15 days</option>
                <option value="30 days">30 days</option>
              </select>
            </label>
            <label>
              <span>Promise Date</span>
              <input
                type="date"
                name="promiseDate"
                value={form.promiseDate}
                onChange={handleFieldChange}
                required
                disabled={isDownloading}
              />
            </label>
          </div>
        </section>

        <section className="tafi-purchase-order-panel" aria-labelledby="tafi-purchase-order-items">
          <div className="tafi-purchase-order-panel-heading">
            <div>
              <h3 id="tafi-purchase-order-items">Items</h3>
              <p>Select item descriptions from the chosen supplier's shared inventory. Quantity, unit, and unit price can be entered or adjusted.</p>
            </div>
            <button type="button" className="tafi-purchase-order-secondary-button" onClick={addItem} disabled={isDownloading}>
              <Plus size={16} aria-hidden="true" />
              Add item
            </button>
          </div>
          <div className="tafi-purchase-order-table-wrap">
            <table className="tafi-purchase-order-table">
              <thead>
                <tr>
                  <th scope="col">Item description</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Unit</th>
                  <th scope="col">Unit price</th>
                  <th scope="col">Total cost</th>
                  <th scope="col"><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id}>
                    <td>
                      <select
                        value={item.inventoryId}
                        onChange={(event) => handleInventoryItemChange(item.id, event.target.value)}
                        aria-label={`Item description ${index + 1}`}
                        disabled={!form.supplier || isLoadingInventory || Boolean(inventoryError) || isDownloading}
                        required
                      >
                        <option value="">
                          {form.supplier ? 'Select an item' : 'Select a supplier first'}
                        </option>
                        {supplierItems.map((inventoryItem) => (
                          <option key={inventoryItem.inventory_id} value={inventoryItem.inventory_id}>
                            {inventoryItem.stock_no} — {inventoryItem.item_description}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={item.quantity}
                        onChange={(event) => handleItemChange(item.id, 'quantity', event.target.value)}
                        aria-label={`Quantity for item ${index + 1}`}
                        required
                        disabled={isDownloading}
                      />
                    </td>
                    <td>
                      <input
                        value={item.unit}
                        onChange={(event) => handleItemChange(item.id, 'unit', event.target.value)}
                        aria-label={`Unit for item ${index + 1}`}
                        maxLength="40"
                        required
                        disabled={isDownloading}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(event) => handleItemChange(item.id, 'unitPrice', event.target.value)}
                        aria-label={`Unit price for item ${index + 1}`}
                        required
                        disabled={isDownloading}
                      />
                    </td>
                    <td className="tafi-purchase-order-line-total">{formatCurrency(getItemTotal(item))}</td>
                    <td>
                      <button
                        type="button"
                        className="tafi-purchase-order-remove-button"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remove item ${index + 1}`}
                        title="Remove item"
                        disabled={items.length === 1 || isDownloading}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {form.supplier && supplierItems.length === 0 && !isLoadingInventory && !inventoryError && (
            <p className="tafi-purchase-order-inline-message" role="status">No shared inventory items are assigned to this supplier.</p>
          )}
        </section>

        <section className="tafi-purchase-order-panel" aria-labelledby="tafi-purchase-order-totals">
          <h3 id="tafi-purchase-order-totals">Cost summary</h3>
          <div className="tafi-purchase-order-fields tafi-purchase-order-cost-fields">
            <label>
              <span>Subtotal</span>
              <input
                type="number"
                name="subtotal"
                min="0"
                max="9999999999.99"
                step="0.01"
                value={form.subtotal}
                onChange={handleFieldChange}
                required
                disabled={isDownloading}
              />
            </label>
            <label>
              <span>Discount</span>
              <input
                type="number"
                name="discount"
                min="0"
                max="9999999999.99"
                step="0.01"
                value={form.discount}
                onChange={handleFieldChange}
                required
                disabled={isDownloading}
              />
            </label>
            <label>
              <span>Add: VAT 12%</span>
              <input
                type="number"
                name="vat"
                min="0"
                max="9999999999.99"
                step="0.01"
                value={form.vat}
                onChange={handleFieldChange}
                required
                disabled={isDownloading}
              />
            </label>
            <label>
              <span>Tax</span>
              <input
                type="number"
                name="tax"
                min="0"
                max="9999999999.99"
                step="0.01"
                value={form.tax}
                onChange={handleFieldChange}
                required
                disabled={isDownloading}
              />
            </label>
          </div>
          <div className="tafi-purchase-order-total">
            <span>Total Cost</span>
            <strong>{formatCurrency(totalCost)}</strong>
          </div>
        </section>

        <section className="tafi-purchase-order-panel" aria-labelledby="tafi-purchase-order-remarks">
          <h3 id="tafi-purchase-order-remarks">Remarks / Comments</h3>
          <textarea
            name="remarks"
            value={form.remarks}
            onChange={handleFieldChange}
            rows="4"
            maxLength="1000"
            disabled={isDownloading}
          />
        </section>

        <div className="tafi-purchase-order-actions">
          <button
            type="submit"
            className="tafi-purchase-order-download-button"
            disabled={isLoadingInventory || Boolean(inventoryError) || suppliers.length === 0 || isDownloading}
          >
            <Download size={17} aria-hidden="true" />
            {isDownloading ? 'Preparing Purchase Order...' : 'Download Purchase Order'}
          </button>
        </div>
      </form>
    </section>
  )
}
