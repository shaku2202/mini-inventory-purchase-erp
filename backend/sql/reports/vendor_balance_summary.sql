-- Vendor purchases, total purchase value, payments made and outstanding balance.
-- Stand-alone version of the v_vendor_balances view (migrations/002) so it can
-- be run directly in psql / any SQL client.
--
-- Each one-to-many table is pre-aggregated per vendor BEFORE joining, which
-- avoids the classic "fan-out" bug where joining purchase_orders AND payments
-- multiplies the totals.

WITH po_totals AS (
  SELECT vendor_id, COUNT(*) AS purchase_order_count, SUM(total_amount) AS total_ordered_value
  FROM purchase_orders
  GROUP BY vendor_id
),
receipt_totals AS (
  SELECT vendor_id, COUNT(*) AS goods_receipt_count, SUM(total_value) AS total_received_value
  FROM goods_receipts
  GROUP BY vendor_id
),
payment_totals AS (
  SELECT vendor_id, COUNT(*) AS payment_count, SUM(amount) AS total_paid
  FROM vendor_payments
  GROUP BY vendor_id
)
SELECT v.id   AS vendor_id,
       v.code AS vendor_code,
       v.name AS vendor_name,
       COALESCE(po.purchase_order_count, 0)  AS purchase_orders,
       COALESCE(po.total_ordered_value, 0)   AS total_purchase_value,   -- ordered
       COALESCE(gr.total_received_value, 0)  AS total_received_value,   -- payable basis
       COALESCE(pay.total_paid, 0)           AS payments_made,
       COALESCE(gr.total_received_value, 0) - COALESCE(pay.total_paid, 0) AS outstanding_balance
FROM vendors v
LEFT JOIN po_totals      po  ON po.vendor_id  = v.id
LEFT JOIN receipt_totals gr  ON gr.vendor_id  = v.id
LEFT JOIN payment_totals pay ON pay.vendor_id = v.id
ORDER BY outstanding_balance DESC, v.name;

-- -----------------------------------------------------------------------------
-- Per purchase-order drill down (ordered vs received vs paid against the PO)
-- -----------------------------------------------------------------------------
SELECT po.po_number,
       v.name                                   AS vendor_name,
       po.status,
       po.total_amount                          AS ordered_value,
       COALESCE(gr.received_value, 0)           AS received_value,
       COALESCE(pay.paid, 0)                    AS paid_against_po,
       COALESCE(gr.received_value, 0) - COALESCE(pay.paid, 0) AS po_outstanding
FROM purchase_orders po
JOIN vendors v ON v.id = po.vendor_id
LEFT JOIN (SELECT purchase_order_id, SUM(total_value) AS received_value
           FROM goods_receipts GROUP BY purchase_order_id) gr ON gr.purchase_order_id = po.id
LEFT JOIN (SELECT purchase_order_id, SUM(amount) AS paid
           FROM vendor_payments WHERE purchase_order_id IS NOT NULL
           GROUP BY purchase_order_id) pay ON pay.purchase_order_id = po.id
ORDER BY po.id;
