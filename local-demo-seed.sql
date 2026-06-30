-- Lokale Demodaten fuer den ersten Rundgang.
-- Kann mehrfach ausgefuehrt werden.

INSERT INTO company_settings (
  company_name, company_name2, street, zip, city, phone, email, website,
  tax_id, vat_id, managing_director, bank_name, iban, bic
)
SELECT
  'FriStD Bau Demo GmbH',
  'Zimmerei | Dach | Heizung | Sanitaer',
  'Musterstrasse 12',
  '20095',
  'Hamburg',
  '040 123456',
  'info@fristd-bau.local',
  'www.fristd-bau.local',
  '12/345/67890',
  'DE123456789',
  'Ronny Demo',
  'Demo Bank',
  'DE02120300000000202051',
  'BYLADEM1001'
WHERE NOT EXISTS (SELECT 1 FROM company_settings);

INSERT INTO accounts (account_number, name, category, class, tax_key, active)
SELECT * FROM (VALUES
  ('8400', 'Erloese 19 Prozent USt', 4, 8, '19', true),
  ('4400', 'Erloese Bauleistungen 19 Prozent', 4, 4, '19', true),
  ('3400', 'Wareneingang 19 Prozent VSt', 3, 3, '19', true),
  ('1200', 'Bank', 1, 1, null, true),
  ('1000', 'Kasse', 1, 1, null, true),
  ('1400', 'Forderungen LuL', 1, 1, null, true),
  ('1600', 'Verbindlichkeiten LuL', 1, 1, null, true)
) AS v(account_number, name, category, class, tax_key, active)
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a.account_number = v.account_number
);

INSERT INTO tax_rates (match_key, name, rate, datev_key, account_number, active)
SELECT * FROM (VALUES
  ('UST19', 'Umsatzsteuer 19 Prozent', 19.00::numeric, '9', '8400', true),
  ('VST19', 'Vorsteuer 19 Prozent', 19.00::numeric, '9', '3400', true),
  ('UST0', 'Steuerfrei', 0.00::numeric, '0', null, true)
) AS v(match_key, name, rate, datev_key, account_number, active)
WHERE NOT EXISTS (
  SELECT 1 FROM tax_rates t WHERE t.match_key = v.match_key
);

INSERT INTO document_number_formats (document_type, format_pattern, separate_credit_notes)
SELECT * FROM (VALUES
  ('angebot', 'jj-nnnnn', false),
  ('auftragsbestaetigung', 'jj-nnnnn', false),
  ('rechnung', 'jj-nnnnn', false),
  ('lieferschein', 'jj-nnnnn', false),
  ('freies_dokument', 'jj-nnnnn', false),
  ('mitschnitt', 'jj-nnnnn', false),
  ('nachkalkulation', 'jj-nnnnn', false)
) AS v(document_type, format_pattern, separate_credit_notes)
ON CONFLICT (document_type) DO UPDATE SET
  format_pattern = EXCLUDED.format_pattern,
  separate_credit_notes = EXCLUDED.separate_credit_notes;

INSERT INTO labor_rates (labor_number, name, description, category, hourly_rate, purchase_price, sale_price1, revenue_account)
SELECT * FROM (VALUES
  ('L-001', 'Monteurstunde', 'Facharbeiter vor Ort', 'Sanitaer/Heizung', 69.30::numeric, 32.00::numeric, 69.30::numeric, '8400'),
  ('L-002', 'Meisterstunde', 'Projektleitung und Abnahme', 'Bauleitung', 89.00::numeric, 45.00::numeric, 89.00::numeric, '8400')
) AS v(labor_number, name, description, category, hourly_rate, purchase_price, sale_price1, revenue_account)
WHERE NOT EXISTS (
  SELECT 1 FROM labor_rates l WHERE l.labor_number = v.labor_number
);

INSERT INTO materials (article_number, search_key, name, description, unit, purchase_price, sell_price, sale_price_1, supplier, category, tax_rate, active)
SELECT * FROM (VALUES
  ('MAT-1001', 'DACHLATTEN', 'Dachlatten 40/60', 'Sortierte Dachlatten fuer Unterkonstruktion', 'm', 0.95::numeric, 1.55::numeric, 1.55::numeric, 'Demo Lieferant', 'Holzbau', '19', true),
  ('MAT-2001', 'ROHR DN100', 'HT Rohr DN100', 'Abwasserrohr inklusive Formteile', 'm', 6.20::numeric, 9.80::numeric, 9.80::numeric, 'Demo Lieferant', 'Sanitaer', '19', true),
  ('FREMD-001', 'GERUEST', 'Gerueststellung pauschal', 'Fremdgewerk Geruestbau fuer Baustelle', 'pau', 850.00::numeric, 1105.00::numeric, 1105.00::numeric, 'Partnerbetrieb', 'Fremdleistung', '19', true)
) AS v(article_number, search_key, name, description, unit, purchase_price, sell_price, sale_price_1, supplier, category, tax_rate, active)
WHERE NOT EXISTS (
  SELECT 1 FROM materials m WHERE m.article_number = v.article_number
);

DO $$
DECLARE
  v_customer_id integer;
  v_project_id integer;
  v_document_id integer;
BEGIN
  INSERT INTO customers (
    customer_number, search_key, salutation, name, street, zip, city, phone, email,
    is_business, payment_term_days, skonto_days, skonto_percent, revenue_account
  )
  VALUES (
    '10000', 'MUSTERMANN', 'Firma', 'Mustermann Immobilien GmbH',
    'Baustellenweg 7', '21035', 'Hamburg', '040 555010', 'bauleitung@mustermann.local',
    true, 14, 7, '2.00', '8400'
  )
  ON CONFLICT (customer_number) DO UPDATE SET
    search_key = EXCLUDED.search_key,
    name = EXCLUDED.name,
    street = EXCLUDED.street,
    zip = EXCLUDED.zip,
    city = EXCLUDED.city,
    email = EXCLUDED.email
  RETURNING id INTO v_customer_id;

  INSERT INTO projects (
    project_number, customer_id, name, short_name, description, street, zip, city,
    branch, status, start_date, budget, cost_center, revenue_account
  )
  VALUES (
    'P-2026-0001', v_customer_id, 'Sanierung Reihenhaus Hamburg-Bergedorf',
    'RH Bergedorf', 'Dach, Holzbau und Badmodernisierung als Musterprojekt',
    'Baustellenweg 7', '21035', 'Hamburg', 'Zimmerei/Dach/Sanitaer',
    'aktiv', '2026-05-04', '42500.00', '1001', '8400'
  )
  ON CONFLICT (project_number) DO UPDATE SET
    customer_id = EXCLUDED.customer_id,
    name = EXCLUDED.name,
    status = EXCLUDED.status,
    budget = EXCLUDED.budget
  RETURNING id INTO v_project_id;

  INSERT INTO documents (
    document_number, type, customer_id, project_id, subject, date, valid_until, status,
    header_text, footer_text, before_work_text, before_totals_text, after_totals_text,
    net_total, tax_rate, tax_amount, gross_total, labor_total, material_vk_total,
    fremd_vk_total, payment_term_days, skonto_days, skonto_percent, erloeskonto,
    created_by
  )
  VALUES (
    '26-00001', 'angebot', v_customer_id, v_project_id,
    'Sanierung Dachflaeche und Sanitär-Vorarbeiten', '2026-04-27', '2026-05-27',
    'entwurf',
    'Sehr geehrte Damen und Herren, gemaess Ortstermin bieten wir Ihnen folgende Leistungen an.',
    'Wir freuen uns auf Ihre Rueckmeldung und stehen fuer Rueckfragen jederzeit zur Verfuegung.',
    'Die Ausfuehrung erfolgt nach Abstimmung mit der Bauleitung.',
    'Zwischensumme der angebotenen Leistungen:',
    'Zahlbar innerhalb von 14 Tagen ohne Abzug, 2 Prozent Skonto bei Zahlung innerhalb von 7 Tagen.',
    '3497.00', '19.00', '664.43', '4161.43', '1039.50', '1352.50',
    '1105.00', 14, 7, '2.00', '8400', 1
  )
  ON CONFLICT (document_number) DO UPDATE SET
    customer_id = EXCLUDED.customer_id,
    project_id = EXCLUDED.project_id,
    subject = EXCLUDED.subject,
    net_total = EXCLUDED.net_total,
    tax_amount = EXCLUDED.tax_amount,
    gross_total = EXCLUDED.gross_total,
    updated_at = now()
  RETURNING id INTO v_document_id;

  DELETE FROM document_items WHERE document_id = v_document_id;

  INSERT INTO document_items (
    document_id, position_number, type, title, description, unit, quantity,
    unit_price, total_price, labor_price, material_price, labor_cost, external_cost,
    labor_time, sort_order, position_flag
  )
  VALUES
    (v_document_id, '1', 'heading', 'Baustelleneinrichtung', 'Einrichten, Absichern und Vorbereiten der Arbeitsbereiche.', null, '1.000', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', 10, 'normal'),
    (v_document_id, '1.1', 'position', 'Arbeitsbereich einrichten', 'Anfahrt, Abstimmung mit Bauleitung, Schutzmassnahmen und Materialbereitstellung.', 'pau', '1.000', '390.00', '390.00', '277.20', '112.80', '128.00', '0.00', '4.00', 20, 'normal'),
    (v_document_id, '2', 'heading', 'Dach- und Holzbau', 'Leistungen fuer die Sanierung der Dachunterkonstruktion.', null, '1.000', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', 30, 'normal'),
    (v_document_id, '2.1', 'position', 'Dachlatten liefern und montieren', 'Dachlatten 40/60 liefern, ausrichten und fachgerecht montieren.', 'm', '250.000', '5.95', '1487.50', '485.10', '1002.40', '224.00', '0.00', '7.00', 40, 'normal'),
    (v_document_id, '3', 'heading', 'Sanitaer-Vorarbeiten', 'Vorbereitende Installationsarbeiten im Badbereich.', null, '1.000', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', 50, 'normal'),
    (v_document_id, '3.1', 'position', 'HT-Rohr DN100 verlegen', 'Abwasserleitung inklusive Formteile liefern, anpassen und montieren.', 'm', '35.000', '14.70', '514.50', '277.20', '237.30', '128.00', '0.00', '4.00', 60, 'normal'),
    (v_document_id, '4', 'position', 'Gerueststellung Fremdgewerk', 'Gerueststellung durch Partnerbetrieb inklusive An- und Abfahrt.', 'pau', '1.000', '1105.00', '1105.00', '0.00', '0.00', '0.00', '850.00', '0.00', 70, 'normal');
END $$;
