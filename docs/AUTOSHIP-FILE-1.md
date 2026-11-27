# AUTOSHIP-FILE-1: ship processed orders from a file, cheapest courier (owner, 27 Nov 2026)

Owner: "in admin panel add option to upload csv file with order number for order processed and generated invoice
number and shipping dimension and volume and box id, weight dimension or box id is enough, to process and autoship
order from whatever courier option is cheaper among growcord ship or shiprocket with option to deselect courier like
india post or other (make sure growship quotes rates are compared including entered commission)".

## What exists (looked first, reused, nothing copied)
- Rates: `shippingAPI.getCourierRates(orderId, warehouseId, {weight, length, breadth, height}, provider)` for
  `growcord_ship` and `shiprocket` (the store's own account); `courierRatesOf` reads both
  (`components/order/ShipmentCreationModal.tsx`). Growcord Ship's rate is the STORE price: cost plus the commission
  set for the store, GST and COD fee included, and the own-Shiprocket undercut rule already applied
  (`growcord-rs apps/ship/core/src/domain/rate.rs` `quote`, `own_panel_prices`). Shiprocket's rate is its total as
  displayed. Both are compared as the total the store pays.
- Booking: `shippingAPI.createShipment(orderId, {provider, courier, box, weight, dims})`, bookable statuses
  confirmed and processing (`pages/growship/Bulk.tsx` BOOKABLE); live-parcel check `shipmentsAPI.byOrder`.
- Boxes: `packagesAPI.getAll()` (the store's box list: dimensions, dead weight); order weight as the bulk page works
  it out (`weighOrder`, `itemUnitWeightKg`).
- Invoice: `invoicesAPI.saveDetails(orderId, {invoiceNumber, invoiceDate})` stores the number the store's own
  accounting issued (refuses a number another order holds, growcord-rs ebb209f5); `ordersAPI.issueInvoice(id)`
  issues the next Growcord number, idempotent.
- Ship's own allocation rule already excludes couriers for Growcord Ship (`ship_allocation_rules.exclusions`).

## The file (template downloadable on the page)
`Order Number` (required), `Invoice Number`, `Invoice Date`, `Box Number`, `Weight (kg)`, `Length (cm)`,
`Breadth (cm)`, `Height (cm)`; the usual other header names are read too (Order ID, Order No, Box No, Bill No and the
like, one list on the page). The box is matched by its box number first (the box list's unique `code`: 3, B3, Box-3),
then its id, then its name. A row needs a box, or weight with all three sides. A box with no weight typed takes the
order's worked-out weight (never under the box's own dead weight). Update 27 Nov 2026 (GS-ACC).

## The page: Orders, Ship from a file
1. Choose the file, the pickup warehouse, and the couriers allowed (every courier both sources answer, ticked; untick
   India Post or any other; the choice is remembered for this store on this browser).
2. Check (nothing written): per row the order found, its state, the invoice it will carry, the parcel, the cheapest
   and the fastest allowed courier with source, price and days (the page picks one for every order, each row can
   switch; fastest is fewest days, never an offer with none), the next cheapest and the saving, or the reason it
   cannot ship (not found, already shipped, cancelled, on hold, no allowed courier, COD order with no COD courier,
   bad size, no invoice number).
3. Ship: per row in order, invoice first: the file's number saved, the order's own number kept, a Growcord number
   issued only when the page option is ticked (off by default: a store's invoices may come from its own ERP); after a
   write the order is read again and booked only when it holds that number. Then the booking with the row's pick. A
   row that fails stops only itself. Results with AWB, courier, price, the invoice booked with; download as CSV.
Never books an order twice: a row whose order already has a live parcel is skipped, and a run's rows are not sent
again from the page.

## Out of scope here
The margin is never shown (the store sees its price only). No backend change: every call exists and is live.
