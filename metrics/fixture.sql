-- Measurement fixture, applied on top of `npm run db:seed`. Idempotent.
-- 1) beta-club gets a dark custom theme (used for the theming / first-paint check).
UPDATE "Club" SET settings = settings || '{"theme":{"background":"#0A0A0A","primary":"#DC2626","accent":"#F97316"}}'::jsonb WHERE slug = 'beta-club';

-- 2) demo-club "General Meeting" gets a 5-field form and 25 guest registrations.
UPDATE "Event" SET "formSchema" = '[
 {"id":"fld_dept","type":"text","label":"Department","required":true},
 {"id":"fld_year","type":"number","label":"Year of study","required":true},
 {"id":"fld_diet","type":"select","label":"Dietary needs","required":false,"options":["None","Vegetarian","Halal","Other"]},
 {"id":"fld_why","type":"textarea","label":"Why are you attending?","required":false},
 {"id":"fld_news","type":"checkbox","label":"Send me the newsletter","required":false}
]'::jsonb
WHERE title = 'General Meeting' AND "clubId" = (SELECT id FROM "Club" WHERE slug='demo-club');

DELETE FROM "Attendance" WHERE "guestEmail" LIKE 'fixture-guest-%';
INSERT INTO "Attendance" (id, "eventId", "guestName", "guestEmail", "formResponses", "updatedAt")
SELECT 'fixture_att_' || g,
       (SELECT id FROM "Event" WHERE title='General Meeting' AND "clubId"=(SELECT id FROM "Club" WHERE slug='demo-club')),
       'Fixture Guest ' || g, 'fixture-guest-' || g || '@example.test',
       jsonb_build_object('fld_dept','Dept '||(g%6),'fld_year',(g%5)+1,'fld_diet',(ARRAY['None','Vegetarian','Halal','Other'])[(g%4)+1],'fld_why','Reason '||g,'fld_news',(g%2=0)),
       now()
FROM generate_series(1,25) g;
