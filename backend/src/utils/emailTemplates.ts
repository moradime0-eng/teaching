// ==================== SHARED HEADER & FOOTER UTILITIES ====================

const getFrontendUrl = (): string =>
  process.env.FRONTEND_URL || 'http://localhost:4200';

const emailStyleHeader = `
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <!--[if mso]>
    <style>
      * { font-family: Tahoma, Arial, sans-serif !important; }
    </style>
  <![endif]-->
  <style>
    body, table, td, div, p, a, span, h1, h2, h3, h4 {
      font-family: Tahoma, 'Segoe UI', 'IRANSans', 'Iranian Sans', Arial, sans-serif !important;
      direction: rtl !important;
      text-align: right;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      background-color: #f1f5f9;
    }
    table {
      border-collapse: collapse !important;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      outline: none;
      text-decoration: none;
    }
    a {
      text-decoration: none;
    }
    .otp-digits {
      font-family: 'Courier New', Courier, monospace !important;
      direction: ltr !important;
    }
    @media screen and (max-width: 600px) {
      .container-table { width: 100% !important; }
      .content-card { padding: 24px 20px !important; }
      .otp-code { font-size: 30px !important; letter-spacing: 6px !important; }
      .main-title { font-size: 18px !important; }
      .cta-button { padding: 12px 24px !important; font-size: 13px !important; }
      .brand-title { font-size: 18px !important; }
    }
  </style>
`;

const brandHeader = `
  <!-- Brand Header -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 28px;">
    <tr>
      <td align="center" style="text-align: center;">
        <div style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 14px 16px; border-radius: 18px; box-shadow: 0 8px 20px rgba(99, 102, 241, 0.25); margin-bottom: 14px;">
          <span style="color: #ffffff; font-size: 32px; line-height: 1; display: inline-block;">🎓</span>
        </div>
        <h1 class="brand-title" style="margin: 0 0 4px 0; font-size: 22px; font-weight: 800; color: #0f172a; direction: rtl; text-align: center; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
          همایون
        </h1>
        <div style="font-size: 12px; color: #64748b; font-weight: 500; direction: rtl; text-align: center; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
          مرکز تخصصی آموزش و مهارت‌افزایی
        </div>
      </td>
    </tr>
  </table>

  <!-- Divider -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
    <tr>
      <td style="height: 1px; background: linear-gradient(90deg, transparent, #e2e8f0, transparent); font-size: 0; line-height: 0;">&nbsp;</td>
    </tr>
  </table>
`;

const brandFooter = `
  <!-- Divider -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 32px;">
    <tr>
      <td style="height: 1px; background: linear-gradient(90deg, transparent, #e2e8f0, transparent); font-size: 0; line-height: 0;">&nbsp;</td>
    </tr>
  </table>

  <!-- Footer -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 24px;">
    <tr>
      <td align="center" style="text-align: center; direction: rtl;">
        <p style="margin: 0 0 10px 0; font-size: 12px; color: #64748b; line-height: 1.8; direction: rtl; text-align: center; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
          این ایمیل به صورت خودکار ارسال شده است، لطفاً از پاسخ مستقیم به آن خودداری فرمایید.
        </p>
        <p style="margin: 0 0 18px 0; font-size: 12px; color: #64748b; line-height: 1.8; direction: rtl; text-align: center; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
          نیاز به پشتیبانی دارید؟ از طریق 
          <a href="${getFrontendUrl()}/support" style="color: #6366f1; text-decoration: none; font-weight: 700;">پرتال پشتیبانی</a> 
          با ما در ارتباط باشید.
        </p>
        
        <!-- Social Icons -->
        <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 16px auto;">
          <tr>
            <td style="padding: 0 6px;">
              <a href="#" style="display: inline-block; width: 32px; height: 32px; background: #f1f5f9; border-radius: 50%; text-align: center; line-height: 32px; text-decoration: none; color: #6366f1; font-size: 14px;">📱</a>
            </td>
            <td style="padding: 0 6px;">
              <a href="#" style="display: inline-block; width: 32px; height: 32px; background: #f1f5f9; border-radius: 50%; text-align: center; line-height: 32px; text-decoration: none; color: #6366f1; font-size: 14px;">💬</a>
            </td>
            <td style="padding: 0 6px;">
              <a href="#" style="display: inline-block; width: 32px; height: 32px; background: #f1f5f9; border-radius: 50%; text-align: center; line-height: 32px; text-decoration: none; color: #6366f1; font-size: 14px;">🌐</a>
            </td>
          </tr>
        </table>

        <p style="margin: 0; font-size: 11px; color: #94a3b8; font-weight: 500; direction: rtl; text-align: center; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
          © ${new Date().getFullYear()} همایون. تمامی حقوق محفوظ است.
        </p>
      </td>
    </tr>
  </table>
`;

// ==================== 1. OTP EMAIL TEMPLATE ====================
export const otpEmailTemplate = (
  name: string,
  otpCode: string,
  purpose: 'register' | 'reset',
): string => {
  const isRegister = purpose === 'register';
  const title = isRegister ? 'تأیید نشانی ایمیل' : 'بازیابی گذرواژه';
  const subtitle = isRegister
    ? 'خوشحالیم که به جمع ما می‌پیوندید! برای فعال‌سازی حساب کاربری خود، لطفاً از کد امنیتی یک‌بار مصرف زیر استفاده کنید.'
    : 'درخواستی مبنی بر بازیابی گذرواژه حساب شما دریافت شده است. برای تنظیم مجدد گذرواژه از کد زیر استفاده کنید.';

  const expiry = isRegister ? '۱۰ دقیقه' : '۱۵ دقیقه';
  const headerThemeColor = isRegister ? '#6366f1' : '#f59e0b';
  const headerThemeBg = isRegister ? 'rgba(99, 102, 241, 0.1)' : 'rgba(245, 158, 11, 0.1)';
  const otpBgColor = isRegister ? '#eef2ff' : '#fffbeb';
  const otpBorderColor = isRegister ? '#c7d2fe' : '#fde68a';

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  ${emailStyleHeader}
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; direction: rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 40px 15px;" dir="rtl">
    <tr>
      <td align="center">
        <table class="container-table" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 600px; max-width: 600px;" dir="rtl">
          <tr>
            <td class="content-card" style="background-color: #ffffff; border-radius: 24px; padding: 40px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06); direction: rtl;">
              
              ${brandHeader}

              <!-- Badge -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom: 20px;">
                    <div style="display: inline-block; background-color: ${headerThemeBg}; color: ${headerThemeColor}; font-size: 12px; font-weight: 700; padding: 8px 18px; border-radius: 100px; direction: rtl; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">
                      🔐 ${title}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Greeting -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="color: #0f172a; font-size: 17px; font-weight: 800; line-height: 1.8; text-align: right; padding-bottom: 10px; direction: rtl; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
                    سلام ${name} عزیز 👋
                  </td>
                </tr>
                <tr>
                  <td style="color: #475569; font-size: 14px; line-height: 1.9; text-align: right; padding-bottom: 30px; direction: rtl; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
                    ${subtitle}
                  </td>
                </tr>
              </table>

              <!-- OTP Code Box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom: 20px;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background-color: ${otpBgColor}; border: 2px dashed ${otpBorderColor}; border-radius: 18px; padding: 26px 40px; text-align: center;">
                          <div style="font-size: 11px; color: #64748b; font-weight: 700; margin-bottom: 10px; direction: rtl; text-align: center; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">
                            کد تأیید شما
                          </div>
                          <div class="otp-code otp-digits" style="font-size: 40px; font-weight: 800; letter-spacing: 10px; color: ${headerThemeColor}; direction: ltr; font-family: 'Courier New', Courier, monospace; line-height: 1; text-align: center;">
                            ${otpCode}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Expiry Warning -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <div style="display: inline-block; background-color: #fef2f2; color: #dc2626; font-size: 13px; font-weight: 700; padding: 8px 16px; border-radius: 10px; direction: rtl; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">
                      ⏳ این کد به مدت ${expiry} معتبر است
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Security Notice -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border-radius: 12px; margin-top: 10px;">
                <tr>
                  <td style="padding: 16px 18px; color: #64748b; font-size: 12px; line-height: 1.8; text-align: right; direction: rtl; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
                    <strong style="color: #475569;">🛡️ نکته امنیتی:</strong>
                    اگر شما این درخواست را ارسال نکرده‌اید، بدون هیچ نگرانی این ایمیل را نادیده بگیرید. کد را با هیچ‌کس به اشتراک نگذارید.
                  </td>
                </tr>
              </table>

              ${brandFooter}

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

// ==================== 2. WELCOME EMAIL TEMPLATE ====================
export const welcomeTemplate = (name: string): string => {
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  ${emailStyleHeader}
  <title>خوش آمدید به همایون</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; direction: rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 40px 15px;" dir="rtl">
    <tr>
      <td align="center">
        <table class="container-table" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 600px; max-width: 600px;" dir="rtl">
          <tr>
            <td class="content-card" style="background-color: #ffffff; border-radius: 24px; padding: 40px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06); direction: rtl;">
              
              ${brandHeader}

              <!-- Celebration Icon -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom: 20px;">
                    <div style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); width: 80px; height: 80px; border-radius: 50%; text-align: center; line-height: 80px; box-shadow: 0 10px 25px rgba(16, 185, 129, 0.35);">
                      <span style="font-size: 42px; line-height: 80px;">🎉</span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Title -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="main-title" style="color: #0f172a; font-size: 24px; font-weight: 800; text-align: center; padding-bottom: 12px; line-height: 1.4; direction: rtl; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
                    خوش آمدی ${name} عزیز!
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <div style="display: inline-block; background-color: rgba(16, 185, 129, 0.1); color: #059669; font-size: 13px; font-weight: 700; padding: 6px 16px; border-radius: 100px; direction: rtl; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">
                      ✅ حساب کاربری شما با موفقیت فعال شد
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Description -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="color: #475569; font-size: 14px; line-height: 1.9; text-align: center; padding-bottom: 30px; direction: rtl; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
                    ما در <strong style="color: #6366f1;">همایون</strong> برای هموار کردن مسیر پیشرفت حرفه‌ای شما نهایت تلاش خود را خواهیم کرد. از همین لحظه می‌توانید به صدها دوره تخصصی، اساتید خبره و جامعه یادگیرندگان مشتاق ما ملحق شوید.
                  </td>
                </tr>
              </table>

              <!-- Features Grid -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 30px;">
                <tr>
                  <td width="33%" style="padding: 12px; text-align: center; direction: rtl;">
                    <div style="background-color: #eef2ff; padding: 16px 8px; border-radius: 14px;">
                      <div style="font-size: 24px; margin-bottom: 6px;">📚</div>
                      <div style="font-size: 11px; font-weight: 700; color: #4f46e5; direction: rtl; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">دوره‌های متنوع</div>
                    </div>
                  </td>
                  <td width="33%" style="padding: 12px; text-align: center; direction: rtl;">
                    <div style="background-color: #fef3c7; padding: 16px 8px; border-radius: 14px;">
                      <div style="font-size: 24px; margin-bottom: 6px;">👨‍🏫</div>
                      <div style="font-size: 11px; font-weight: 700; color: #d97706; direction: rtl; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">اساتید مجرب</div>
                    </div>
                  </td>
                  <td width="33%" style="padding: 12px; text-align: center; direction: rtl;">
                    <div style="background-color: #dcfce7; padding: 16px 8px; border-radius: 14px;">
                      <div style="font-size: 24px; margin-bottom: 6px;">🏆</div>
                      <div style="font-size: 11px; font-weight: 700; color: #059669; direction: rtl; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">گواهی معتبر</div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); border-radius: 12px; box-shadow: 0 8px 20px rgba(99, 102, 241, 0.35);">
                          <a href="${getFrontendUrl()}/dashboard" class="cta-button" style="display: inline-block; color: #ffffff; padding: 14px 32px; font-size: 14px; font-weight: 700; text-decoration: none; direction: rtl; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">
                            🚀 ورود به پنل کاربری
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${brandFooter}

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

// ==================== 3. ENROLLMENT TEMPLATE ====================
export const enrollmentTemplate = (name: string, courseName: string): string => {
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  ${emailStyleHeader}
  <title>ثبت‌نام موفق در دوره</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; direction: rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 40px 15px;" dir="rtl">
    <tr>
      <td align="center">
        <table class="container-table" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 600px; max-width: 600px;" dir="rtl">
          <tr>
            <td class="content-card" style="background-color: #ffffff; border-radius: 24px; padding: 40px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06); direction: rtl;">
              
              ${brandHeader}

              <!-- Success Icon -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom: 20px;">
                    <div style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); width: 72px; height: 72px; border-radius: 50%; text-align: center; line-height: 72px; box-shadow: 0 10px 25px rgba(16, 185, 129, 0.35);">
                      <span style="font-size: 36px; line-height: 72px;">🚀</span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Title -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="main-title" style="color: #0f172a; font-size: 22px; font-weight: 800; text-align: center; padding-bottom: 8px; line-height: 1.4; direction: rtl; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
                    ثبت‌نام شما با موفقیت انجام شد!
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <div style="display: inline-block; background-color: rgba(16, 185, 129, 0.1); color: #059669; font-size: 12px; font-weight: 700; padding: 6px 16px; border-radius: 100px; direction: rtl; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">
                      ✅ رسید تأیید عضویت در دوره آموزشی
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Greeting -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="color: #0f172a; font-size: 15px; font-weight: 700; line-height: 1.8; text-align: right; padding-bottom: 10px; direction: rtl; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
                    ${name} عزیز، سلام 👋
                  </td>
                </tr>
                <tr>
                  <td style="color: #475569; font-size: 14px; line-height: 1.9; text-align: right; padding-bottom: 24px; direction: rtl; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
                    شما با موفقیت در دوره تخصصی زیر ثبت‌نام کرده‌اید و از هم‌اکنون تمامی ویدیوها، سرفصل‌ها و پروژه‌های این دوره در پنل دانشجویی شما در دسترس است.
                  </td>
                </tr>
              </table>

              <!-- Course Card -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%); border: 1px solid #c7d2fe; border-radius: 16px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px; direction: rtl;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl">
                      <tr>
                        <td width="56" style="vertical-align: middle; padding-left: 14px; direction: rtl;">
                          <div style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); width: 52px; height: 52px; border-radius: 14px; text-align: center; line-height: 52px; box-shadow: 0 6px 16px rgba(99, 102, 241, 0.35);">
                            <span style="font-size: 24px; line-height: 52px;">📚</span>
                          </div>
                        </td>
                        <td style="vertical-align: middle; direction: rtl; text-align: right;">
                          <div style="font-size: 11px; color: #6366f1; font-weight: 700; margin-bottom: 6px; direction: rtl; text-align: right; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">
                            عنوان دوره ثبت‌نام شده:
                          </div>
                          <div style="font-size: 15px; color: #0f172a; font-weight: 800; line-height: 1.6; direction: rtl; text-align: right; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
                            ${courseName}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Info Boxes -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
                <tr>
                  <td width="50%" style="padding-left: 6px; direction: rtl;">
                    <div style="background-color: #f0fdf4; border-radius: 12px; padding: 14px; text-align: center;">
                      <div style="font-size: 20px; margin-bottom: 4px;">♾️</div>
                      <div style="font-size: 11px; font-weight: 700; color: #059669; direction: rtl; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">دسترسی مادام‌العمر</div>
                    </div>
                  </td>
                  <td width="50%" style="padding-right: 6px; direction: rtl;">
                    <div style="background-color: #fef3c7; border-radius: 12px; padding: 14px; text-align: center;">
                      <div style="font-size: 20px; margin-bottom: 4px;">🎯</div>
                      <div style="font-size: 11px; font-weight: 700; color: #d97706; direction: rtl; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">پشتیبانی تخصصی</div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); border-radius: 12px; box-shadow: 0 8px 20px rgba(99, 102, 241, 0.35);">
                          <a href="${getFrontendUrl()}/my-courses" class="cta-button" style="display: inline-block; color: #ffffff; padding: 14px 32px; font-size: 14px; font-weight: 700; text-decoration: none; direction: rtl; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">
                            🎓 ورود به پنل دانشجویی
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${brandFooter}

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

// ==================== 4. COURSE REJECTED TEMPLATE ====================
export const courseRejectedTemplate = (
  instructorName: string,
  courseName: string,
  rejectionReason: string,
  courseUrl: string,
): string => {
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  ${emailStyleHeader}
  <title>نیازمند ویرایش دوره</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; direction: rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 40px 15px;" dir="rtl">
    <tr>
      <td align="center">
        <table class="container-table" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 600px; max-width: 600px;" dir="rtl">
          <tr>
            <td class="content-card" style="background-color: #ffffff; border-radius: 24px; padding: 40px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06); direction: rtl;">
              
              ${brandHeader}

              <!-- Warning Icon -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom: 20px;">
                    <div style="display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); width: 72px; height: 72px; border-radius: 50%; text-align: center; line-height: 72px; box-shadow: 0 10px 25px rgba(239, 68, 68, 0.3);">
                      <span style="font-size: 36px; line-height: 72px;">⚠️</span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Title -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="main-title" style="color: #dc2626; font-size: 20px; font-weight: 800; text-align: center; padding-bottom: 8px; line-height: 1.4; direction: rtl; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
                    دوره آموزشی شما نیاز به ویرایش دارد
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <div style="display: inline-block; background-color: rgba(239, 68, 68, 0.1); color: #dc2626; font-size: 12px; font-weight: 700; padding: 6px 16px; border-radius: 100px; direction: rtl; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">
                      📝 نتیجه بازبینی تیم ارزیابی
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Greeting -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="color: #0f172a; font-size: 15px; font-weight: 700; line-height: 1.8; text-align: right; padding-bottom: 10px; direction: rtl; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
                    استاد ${instructorName} گرامی، سلام 👋
                  </td>
                </tr>
                <tr>
                  <td style="color: #475569; font-size: 14px; line-height: 1.9; text-align: right; padding-bottom: 20px; direction: rtl; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
                    ضمن تشکر از ارسال دوره ارزشمند شما، پس از بازبینی دقیق تیم ارزیابی محتوا، متأسفانه در حال حاضر امکان تأیید و انتشار دوره <strong style="color: #dc2626;">«${courseName}»</strong> به علت مغایرت با قوانین کیفیت پلتفرم وجود ندارد.
                  </td>
                </tr>
              </table>

              <!-- Rejection Alert Box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fef2f2; border: 1px solid #fecaca; border-right: 5px solid #ef4444; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 18px 20px; direction: rtl;">
                    <div style="font-size: 13px; font-weight: 800; color: #991b1b; margin-bottom: 8px; direction: rtl; text-align: right; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">
                      📋 دلیل رد ارزیابی کیفیت:
                    </div>
                    <div style="color: #7f1d1d; font-size: 13px; line-height: 1.9; text-align: right; direction: rtl; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
                      ${rejectionReason}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Guidance -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="color: #475569; font-size: 14px; line-height: 1.9; text-align: right; padding-bottom: 24px; direction: rtl; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
                    خواهشمندیم موارد قید شده را رفع کرده و دوره را برای ارزیابی مجدد ارسال کنید. در صورت وجود هرگونه سؤال، تیم پشتیبانی ما آماده راهنمایی شماست.
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border-radius: 12px; box-shadow: 0 8px 20px rgba(239, 68, 68, 0.3);">
                          <a href="${courseUrl}" class="cta-button" style="display: inline-block; color: #ffffff; padding: 14px 32px; font-size: 14px; font-weight: 700; text-decoration: none; direction: rtl; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">
                            ✏️ اصلاح و ارسال مجدد دوره
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${brandFooter}

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

// ==================== 5. COURSE APPROVED TEMPLATE ====================
export const courseApprovedTemplate = (
  instructorName: string,
  courseName: string,
  courseUrl: string,
): string => {
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  ${emailStyleHeader}
  <title>دوره شما تأیید شد</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; direction: rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 40px 15px;" dir="rtl">
    <tr>
      <td align="center">
        <table class="container-table" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 600px; max-width: 600px;" dir="rtl">
          <tr>
            <td class="content-card" style="background-color: #ffffff; border-radius: 24px; padding: 40px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06); direction: rtl;">
              
              ${brandHeader}

              <!-- Success Icon -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom: 20px;">
                    <div style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); width: 80px; height: 80px; border-radius: 50%; text-align: center; line-height: 80px; box-shadow: 0 10px 25px rgba(16, 185, 129, 0.35);">
                      <span style="font-size: 40px; line-height: 80px;">🌟</span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Title -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="main-title" style="color: #059669; font-size: 22px; font-weight: 800; text-align: center; padding-bottom: 8px; line-height: 1.4; direction: rtl; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
                    تبریک! دوره شما منتشر شد 🎊
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <div style="display: inline-block; background-color: rgba(16, 185, 129, 0.1); color: #059669; font-size: 12px; font-weight: 700; padding: 6px 16px; border-radius: 100px; direction: rtl; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">
                      ✅ تأیید و انتشار موفقیت‌آمیز
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Greeting -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="color: #0f172a; font-size: 15px; font-weight: 700; line-height: 1.8; text-align: right; padding-bottom: 10px; direction: rtl; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
                    استاد ${instructorName} گرامی، سلام 👋
                  </td>
                </tr>
                <tr>
                  <td style="color: #475569; font-size: 14px; line-height: 1.9; text-align: right; padding-bottom: 20px; direction: rtl; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
                    خوشحالیم به اطلاع شما برسانیم که دوره باارزش شما تحت عنوان <strong style="color: #059669;">«${courseName}»</strong> با موفقیت بررسی شد و با تأیید کیفی، هم‌اکنون به صورت عمومی منتشر شده و آماده جذب دانشجو است.
                  </td>
                </tr>
              </table>

              <!-- Success Info Box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-right: 5px solid #10b981; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 18px 20px; direction: rtl;">
                    <div style="font-size: 13px; font-weight: 800; color: #166534; margin-bottom: 6px; direction: rtl; text-align: right; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">
                      🎯 دوره شما هم‌اکنون فعال است!
                    </div>
                    <div style="color: #14532d; font-size: 13px; line-height: 1.9; text-align: right; direction: rtl; font-family: Tahoma, 'Segoe UI', 'IRANSans', Arial, sans-serif;">
                      دانشجویان از این لحظه می‌توانند محتوای دوره شما را تماشا کرده و در آن ثبت‌نام کنند. با آرزوی تدریسی شیرین و پرفروغ برای شما!
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Stats Boxes -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
                <tr>
                  <td width="33%" style="padding: 6px; direction: rtl;">
                    <div style="background-color: #eef2ff; padding: 14px 8px; border-radius: 12px; text-align: center;">
                      <div style="font-size: 22px; margin-bottom: 4px;">👥</div>
                      <div style="font-size: 10px; font-weight: 700; color: #4f46e5; direction: rtl; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">جذب دانشجو</div>
                    </div>
                  </td>
                  <td width="33%" style="padding: 6px; direction: rtl;">
                    <div style="background-color: #fef3c7; padding: 14px 8px; border-radius: 12px; text-align: center;">
                      <div style="font-size: 22px; margin-bottom: 4px;">💰</div>
                      <div style="font-size: 10px; font-weight: 700; color: #d97706; direction: rtl; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">درآمدزایی</div>
                    </div>
                  </td>
                  <td width="33%" style="padding: 6px; direction: rtl;">
                    <div style="background-color: #dcfce7; padding: 14px 8px; border-radius: 12px; text-align: center;">
                      <div style="font-size: 22px; margin-bottom: 4px;">📊</div>
                      <div style="font-size: 10px; font-weight: 700; color: #059669; direction: rtl; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">آمار زنده</div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 12px; box-shadow: 0 8px 20px rgba(16, 185, 129, 0.35);">
                          <a href="${courseUrl}" class="cta-button" style="display: inline-block; color: #ffffff; padding: 14px 32px; font-size: 14px; font-weight: 700; text-decoration: none; direction: rtl; font-family: Tahoma, 'Segoe UI', Arial, sans-serif;">
                            👁️ مشاهده دوره در سایت
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${brandFooter}

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};