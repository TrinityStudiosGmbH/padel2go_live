-- Belege-Tab im Admin, delegierbar wie die anderen Betriebsseiten.
INSERT INTO public.admin_pages (key, label, route, sort_order, is_delegatable)
VALUES ('receipts', 'Belege', '/admin/belege', 115, true)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label, route = EXCLUDED.route, sort_order = EXCLUDED.sort_order;
