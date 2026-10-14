// إعدادات Supabase. المفتاح هنا هو anon العام فقط (آمن للنشر بشرط تفعيل RLS من supabase/schema.sql).
// ⚠️ لا تضع هنا service_role أبداً (ولا كلمات سر الخدام). لو تركتهم فاضيين تفضل المزامنة متوقفة والتطبيق يشتغل محلياً بالكامل.
// v6: رابط Edge Function الاسترجاع يُشتق تلقائياً من SUPABASE_URL (/functions/v1/restore) فلا إعداد إضافي هنا.
export const SUPABASE_URL='https://wdrphckkiqbsgqphbgez.supabase.co';
export const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkcnBoY2traXFic2dxcGhiZ2V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3NjIyNDUsImV4cCI6MjEwNzMzODI0NX0.Xa5l9n-P3TEIXJ0GWMHiiepS5S4POsNPh7abb4Mzg58';
