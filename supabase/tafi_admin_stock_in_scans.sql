DO $$
BEGIN
    IF to_regclass('public.inventory_information') IS NULL THEN
        RAISE EXCEPTION
            'Run the TAFI Admin inventory migration before this stock-in migration.';
    END IF;

    IF to_regprocedure('public.tafi_admin_list_inventory_information(uuid)') IS NULL THEN
        RAISE EXCEPTION
            'The session-validating inventory RPC is missing; install the TAFI Admin inventory migration first.';
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.tafi_admin_stock_in_scans (
    barcode text PRIMARY KEY CHECK (btrim(barcode) <> ''),
    stock_no text NOT NULL,
    item_description text NOT NULL,
    unit_of_measure text NOT NULL,
    scan_count bigint NOT NULL DEFAULT 0 CHECK (scan_count >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tafi_admin_stock_in_scans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tafi_admin_stock_in_scans FROM PUBLIC, anon, authenticated;

-- Drop any earlier text-token versions so only the uuid versions remain.
DROP FUNCTION IF EXISTS public.tafi_admin_record_stock_in_scan(text, text, text);
DROP FUNCTION IF EXISTS public.tafi_admin_list_stock_in_scans(text);

CREATE OR REPLACE FUNCTION public.tafi_admin_record_stock_in_scan(
    p_session_token uuid,
    p_barcode text,
    p_stock_no text DEFAULT NULL
)
RETURNS TABLE (
    barcode text,
    stock_no text,
    item_description text,
    unit_of_measure text,
    scan_count bigint,
    needs_stock_selection boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_barcode text := btrim(p_barcode);
    v_stock_no text := nullif(btrim(p_stock_no), '');
    v_item_description text;
    v_unit_of_measure text;
    v_item_matches integer;
    v_scan public.tafi_admin_stock_in_scans%ROWTYPE;
BEGIN
    IF p_session_token IS NULL THEN
        RAISE EXCEPTION 'A valid TAFI Admin session is required.';
    END IF;

    IF v_barcode IS NULL OR v_barcode = '' THEN
        RAISE EXCEPTION 'A barcode is required.';
    END IF;

    -- Reuse the installed RPC's session and expiry validation.
    PERFORM 1
    FROM public.tafi_admin_list_inventory_information(p_session_token);

    IF v_stock_no IS NULL THEN
        UPDATE public.tafi_admin_stock_in_scans AS saved
        SET scan_count = saved.scan_count + 1,
            updated_at = now()
        WHERE saved.barcode = v_barcode
        RETURNING saved.* INTO v_scan;

        IF FOUND THEN
            RETURN QUERY
            SELECT v_scan.barcode, v_scan.stock_no, v_scan.item_description,
                   v_scan.unit_of_measure, v_scan.scan_count, false;
        ELSE
            RETURN QUERY
            SELECT v_barcode, NULL::text, NULL::text, NULL::text, 0::bigint, true;
        END IF;
        RETURN;
    END IF;

    SELECT count(*)::integer
    INTO v_item_matches
    FROM public.inventory_information AS inventory
    WHERE inventory.stock_no = v_stock_no;

    IF v_item_matches = 0 THEN
        RAISE EXCEPTION 'The selected stock number does not exist.';
    ELSIF v_item_matches > 1 THEN
        RAISE EXCEPTION 'The selected stock number is not unique.';
    END IF;

    SELECT inventory.item_description, inventory.unit_of_measure
    INTO v_item_description, v_unit_of_measure
    FROM public.inventory_information AS inventory
    WHERE inventory.stock_no = v_stock_no;

    -- ON CONSTRAINT avoids ambiguity with the "barcode" output column.
    INSERT INTO public.tafi_admin_stock_in_scans AS saved (
        barcode,
        stock_no,
        item_description,
        unit_of_measure,
        scan_count
    )
    VALUES (
        v_barcode,
        v_stock_no,
        v_item_description,
        v_unit_of_measure,
        1
    )
    ON CONFLICT ON CONSTRAINT tafi_admin_stock_in_scans_pkey DO UPDATE
    SET scan_count = saved.scan_count + 1,
        updated_at = now()
    WHERE saved.stock_no = EXCLUDED.stock_no
      AND saved.item_description = EXCLUDED.item_description
      AND saved.unit_of_measure = EXCLUDED.unit_of_measure
    RETURNING saved.* INTO v_scan;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'This barcode is already linked to a different item.';
    END IF;

    RETURN QUERY
    SELECT v_scan.barcode, v_scan.stock_no, v_scan.item_description,
           v_scan.unit_of_measure, v_scan.scan_count, false;
END;
$$;

DROP FUNCTION IF EXISTS public.tafi_admin_list_stock_in_scans(uuid);

CREATE FUNCTION public.tafi_admin_list_stock_in_scans(
    p_session_token uuid
)
RETURNS TABLE (
    barcode text,
    stock_no text,
    item_description text,
    unit_of_measure text,
    scan_count bigint,
    needs_stock_selection boolean,
    updated_at timestamptz,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF p_session_token IS NULL THEN
        RAISE EXCEPTION 'A valid TAFI Admin session is required.';
    END IF;

    -- Reuse the installed RPC's session and expiry validation.
    PERFORM 1
    FROM public.tafi_admin_list_inventory_information(p_session_token);

    RETURN QUERY
    SELECT saved.barcode, saved.stock_no, saved.item_description,
           saved.unit_of_measure, saved.scan_count, false,
           saved.updated_at, saved.created_at
    FROM public.tafi_admin_stock_in_scans AS saved
    ORDER BY saved.stock_no, saved.barcode;
END;
$$;

DROP FUNCTION IF EXISTS public.tafi_admin_list_stock_inventory(uuid);

CREATE FUNCTION public.tafi_admin_list_stock_inventory(
    p_session_token uuid
)
RETURNS TABLE (
    stock_inventory_id uuid,
    inventory_id uuid,
    stock_no text,
    item_description text,
    unit_of_measure text,
    category text,
    available numeric,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.tafi_admin_session AS admin_session
        WHERE admin_session.session_token = p_session_token
          AND admin_session.expires_at > now()
    ) THEN
        RAISE EXCEPTION 'TAFI Admin session is invalid or expired' USING ERRCODE = '28000';
    END IF;

    RETURN QUERY
    SELECT stock.id,
           stock.inventory_id,
           stock.stock_no,
           stock.item_description,
           stock.unit_of_measure,
           inventory.category,
           COALESCE(barcode_totals.item_count, 0::numeric),
           stock.created_at
    FROM public.tafi_stock_inventory AS stock
    JOIN public.inventory_information AS inventory
      ON inventory.id = stock.inventory_id
    LEFT JOIN (
        SELECT saved.stock_no, SUM(saved.scan_count)::numeric AS item_count
        FROM public.tafi_admin_stock_in_scans AS saved
        GROUP BY saved.stock_no
    ) AS barcode_totals
      ON barcode_totals.stock_no = stock.stock_no
    ORDER BY inventory.stock_no, stock.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.tafi_admin_record_stock_in_scan(uuid, text, text)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tafi_admin_list_stock_in_scans(uuid)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tafi_admin_list_stock_inventory(uuid)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.tafi_admin_record_stock_in_scan(uuid, text, text)
    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tafi_admin_list_stock_in_scans(uuid)
    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tafi_admin_list_stock_inventory(uuid)
    TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
