-- =============================================================================
-- 001_init_schema.sql
-- Mini Inventory & Purchase ERP - core schema (PostgreSQL 14+)
--
-- Conventions
--   * Surrogate BIGINT identity primary keys, human readable business numbers
--     (PO-000001, GRN-000001, PAY-000001) generated from dedicated sequences.
--   * Money  -> NUMERIC(14,2)  (never float)
--   * Qty    -> NUMERIC(14,3)  (glass is often bought in sqm / kg, not only pieces)
--   * Every table has created_at; mutable master tables also have updated_at.
--   * Business rules that must NEVER be broken are also enforced by CHECK
--     constraints, so a bug in the API layer still cannot corrupt the data.
-- =============================================================================

-- ---------- shared trigger: keep updated_at fresh ----------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------- vendors ----------------------------------------------------------
CREATE TABLE vendors (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code           VARCHAR(30)  NOT NULL,
  name           VARCHAR(150) NOT NULL,
  contact_person VARCHAR(100),
  email          VARCHAR(150),
  phone          VARCHAR(20),
  gstin          VARCHAR(15),
  address        TEXT,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_vendors_code UNIQUE (code),
  CONSTRAINT ck_vendors_name_not_blank CHECK (length(btrim(name)) > 0)
);
CREATE INDEX idx_vendors_name ON vendors (lower(name));
CREATE TRIGGER trg_vendors_updated_at BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- products ---------------------------------------------------------
CREATE TABLE products (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku           VARCHAR(40)   NOT NULL,
  name          VARCHAR(150)  NOT NULL,
  description   TEXT,
  unit          VARCHAR(10)   NOT NULL,
  reorder_level NUMERIC(14,3) NOT NULL DEFAULT 0,
  -- Denormalised running balance. The source of truth is stock_movements;
  -- this column is only ever changed in the same transaction that inserts a
  -- movement row, and the movement stores balance_after for traceability.
  current_stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_products_sku UNIQUE (sku),
  CONSTRAINT ck_products_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT ck_products_unit CHECK (unit IN ('PCS', 'SQM', 'SQFT', 'KG', 'LTR', 'MTR', 'BOX')),
  CONSTRAINT ck_products_stock_non_negative CHECK (current_stock >= 0),
  CONSTRAINT ck_products_reorder_non_negative CHECK (reorder_level >= 0)
);
CREATE INDEX idx_products_name ON products (lower(name));
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- purchase orders --------------------------------------------------
CREATE SEQUENCE po_number_seq;

CREATE TABLE purchase_orders (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  po_number    VARCHAR(20)   NOT NULL DEFAULT ('PO-' || lpad(nextval('po_number_seq')::text, 6, '0')),
  vendor_id    BIGINT        NOT NULL REFERENCES vendors (id) ON DELETE RESTRICT,
  order_date   DATE          NOT NULL DEFAULT CURRENT_DATE,
  expected_date DATE,
  status       VARCHAR(20)   NOT NULL DEFAULT 'OPEN',
  -- Sum of purchase_order_items.line_total, written in the same transaction
  -- that inserts the lines.
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes        TEXT,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_purchase_orders_po_number UNIQUE (po_number),
  CONSTRAINT ck_purchase_orders_status CHECK (status IN ('OPEN', 'PARTIALLY_RECEIVED', 'RECEIVED')),
  CONSTRAINT ck_purchase_orders_total CHECK (total_amount >= 0),
  CONSTRAINT ck_purchase_orders_dates CHECK (expected_date IS NULL OR expected_date >= order_date)
);
CREATE INDEX idx_purchase_orders_vendor ON purchase_orders (vendor_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders (status);
CREATE INDEX idx_purchase_orders_created ON purchase_orders (created_at DESC);
CREATE TRIGGER trg_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- purchase order items --------------------------------------------
CREATE TABLE purchase_order_items (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  purchase_order_id BIGINT        NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
  product_id        BIGINT        NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  quantity          NUMERIC(14,3) NOT NULL,
  unit_price        NUMERIC(14,2) NOT NULL,
  line_total        NUMERIC(14,2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,
  received_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  -- one line per product per PO keeps receiving & reporting unambiguous
  CONSTRAINT uq_po_items_po_product UNIQUE (purchase_order_id, product_id),
  CONSTRAINT ck_po_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT ck_po_items_unit_price_positive CHECK (unit_price > 0),
  -- the final guard against over-receiving / double receiving
  CONSTRAINT ck_po_items_received_range CHECK (received_quantity >= 0 AND received_quantity <= quantity)
);
CREATE INDEX idx_po_items_product ON purchase_order_items (product_id);
CREATE TRIGGER trg_po_items_updated_at BEFORE UPDATE ON purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- goods receipts (GRN) ---------------------------------------------
CREATE SEQUENCE grn_number_seq;

CREATE TABLE goods_receipts (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grn_number        VARCHAR(20)   NOT NULL DEFAULT ('GRN-' || lpad(nextval('grn_number_seq')::text, 6, '0')),
  purchase_order_id BIGINT        NOT NULL REFERENCES purchase_orders (id) ON DELETE RESTRICT,
  -- denormalised from the PO so payable reports do not need an extra join
  vendor_id         BIGINT        NOT NULL REFERENCES vendors (id) ON DELETE RESTRICT,
  received_date     DATE          NOT NULL DEFAULT CURRENT_DATE,
  -- value of goods received = sum(received qty * PO unit price) -> the payable
  total_value       NUMERIC(14,2) NOT NULL,
  -- duplicate protection: the client sends the same key when retrying
  idempotency_key   VARCHAR(100)  NOT NULL,
  request_hash      CHAR(64)      NOT NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_goods_receipts_grn_number UNIQUE (grn_number),
  CONSTRAINT uq_goods_receipts_idempotency_key UNIQUE (idempotency_key),
  CONSTRAINT ck_goods_receipts_total CHECK (total_value > 0)
);
CREATE INDEX idx_goods_receipts_po ON goods_receipts (purchase_order_id);
CREATE INDEX idx_goods_receipts_vendor ON goods_receipts (vendor_id);

CREATE TABLE goods_receipt_items (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  goods_receipt_id       BIGINT        NOT NULL REFERENCES goods_receipts (id) ON DELETE CASCADE,
  purchase_order_item_id BIGINT        NOT NULL REFERENCES purchase_order_items (id) ON DELETE RESTRICT,
  product_id             BIGINT        NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  quantity               NUMERIC(14,3) NOT NULL,
  unit_price             NUMERIC(14,2) NOT NULL,
  line_value             NUMERIC(14,2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_gr_items_receipt_po_item UNIQUE (goods_receipt_id, purchase_order_item_id),
  CONSTRAINT ck_gr_items_quantity_positive CHECK (quantity > 0)
);
CREATE INDEX idx_gr_items_po_item ON goods_receipt_items (purchase_order_item_id);
CREATE INDEX idx_gr_items_product ON goods_receipt_items (product_id);

-- ---------- stock movements (inventory ledger) -------------------------------
CREATE TABLE stock_movements (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id     BIGINT        NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  movement_type  VARCHAR(30)   NOT NULL,
  -- signed: +ve = stock in, -ve = stock out
  quantity       NUMERIC(14,3) NOT NULL,
  balance_after  NUMERIC(14,3) NOT NULL,
  reference_type VARCHAR(30)   NOT NULL,
  reference_id   BIGINT        NOT NULL,
  remarks        TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_stock_movements_type CHECK (movement_type IN ('PURCHASE_RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'ISSUE')),
  CONSTRAINT ck_stock_movements_qty_non_zero CHECK (quantity <> 0),
  CONSTRAINT ck_stock_movements_balance CHECK (balance_after >= 0)
);
CREATE INDEX idx_stock_movements_product_created ON stock_movements (product_id, created_at DESC, id DESC);
CREATE INDEX idx_stock_movements_reference ON stock_movements (reference_type, reference_id);

-- ---------- vendor payments --------------------------------------------------
CREATE SEQUENCE payment_number_seq;

CREATE TABLE vendor_payments (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_number    VARCHAR(20)   NOT NULL DEFAULT ('PAY-' || lpad(nextval('payment_number_seq')::text, 6, '0')),
  vendor_id         BIGINT        NOT NULL REFERENCES vendors (id) ON DELETE RESTRICT,
  -- optional allocation to a specific purchase order ("invoice")
  purchase_order_id BIGINT        REFERENCES purchase_orders (id) ON DELETE RESTRICT,
  amount            NUMERIC(14,2) NOT NULL,
  payment_date      DATE          NOT NULL DEFAULT CURRENT_DATE,
  payment_method    VARCHAR(20)   NOT NULL,
  reference_no      VARCHAR(50),
  idempotency_key   VARCHAR(100)  NOT NULL,
  request_hash      CHAR(64)      NOT NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_vendor_payments_number UNIQUE (payment_number),
  CONSTRAINT uq_vendor_payments_idempotency_key UNIQUE (idempotency_key),
  CONSTRAINT ck_vendor_payments_amount_positive CHECK (amount > 0),
  CONSTRAINT ck_vendor_payments_method CHECK (payment_method IN ('BANK_TRANSFER', 'CHEQUE', 'CASH', 'UPI'))
);
CREATE INDEX idx_vendor_payments_vendor ON vendor_payments (vendor_id, payment_date DESC);
CREATE INDEX idx_vendor_payments_po ON vendor_payments (purchase_order_id) WHERE purchase_order_id IS NOT NULL;
