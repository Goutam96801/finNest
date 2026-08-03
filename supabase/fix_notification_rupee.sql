-- Fix corrupted ₹ (stored as ???) in notification bodies/titles
UPDATE public.notifications
SET
  body = replace(body, '???', U&'\20B9'),
  title = replace(title, '???', U&'\20B9')
WHERE body LIKE '%???%' OR title LIKE '%???%';
