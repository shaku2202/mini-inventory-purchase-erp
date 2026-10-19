-- =============================================================================
-- 002_vendor_balance_view.sql
-- Vendor purchase / payable / payment summary.
--
-- WHY CTEs: vendors -> purchase_orders, vendors -> goods_receipts and
-- vendors -> vendor_payments are three independent one-to-many relations.
-- Joining them directly and then SUM()-ing produces a cartesian fan-out
-- (2 POs x 3 payments = 6 rows -> every total is multiplied). Each child set is
-- therefore aggregated to ONE row per vendor first, and only then joined.
--
-- Payable policy: a vendor is owed money for goods actually RECEIVED
-- (sum of GRN values), not for goods merely ordered.
--   outstanding_balance = total_received_value - total_paid
-- =============================================================================
CREATE OR REPLACE VIEW v_vendor_balances AS
WITH po_totals AS (
  SELECT vendor_id,
         COUNT(*)          AS purchase_order_count,
         SUM(total_amount) AS total_ordered_value
  FROM purchase_orders
  GROUP BY vendor_id
),
receipt_totals AS (
  SELECT vendor_id,
         COUNT(*)         AS goods_receipt_count,
         SUM(total_value) AS total_received_value
  FROM goods_receipts
  GROUP BY vendor_id
),
payment_totals AS (
  SELECT vendor_id,
         COUNT(*)    AS payment_count,
         SUM(amount) AS total_paid
  FROM vendor_payments
  GROUP BY vendor_id
)
SELECT v.id                                        AS vendor_id,
       v.code                                      AS vendor_code,
       v.name                                      AS vendor_name,
       COALESCE(po.purchase_order_count, 0)        AS purchase_order_count,
       COALESCE(po.total_ordered_value, 0)::numeric(14,2)  AS total_ordered_value,
       COALESCE(gr.goods_receipt_count, 0)         AS goods_receipt_count,
       COALESCE(gr.total_received_value, 0)::numeric(14,2) AS total_received_value,
       COALESCE(pay.payment_count, 0)              AS payment_count,
       COALESCE(pay.total_paid, 0)::numeric(14,2)          AS total_paid,
       (COALESCE(gr.total_received_value, 0)
         - COALESCE(pay.total_paid, 0))::numeric(14,2) AS outstanding_balance
FROM vendors v
LEFT JOIN po_totals      po  ON po.vendor_id  = v.id
LEFT JOIN receipt_totals gr  ON gr.vendor_id  = v.id
LEFT JOIN payment_totals pay ON pay.vendor_id = v.id;
