// Danh sách câu hỏi của đơn UK Standard Visitor visa (gov.uk / Access UK), theo đúng thứ tự nhóm.
// Các câu hỏi an ninh / tiền án / khủng bố được CỐ Ý loại bỏ.

export interface VisaQuestion {
  id: string;
  q: string; // câu hỏi tiếng Anh như trên form
  vi: string; // gợi ý tiếng Việt cho tư vấn viên
  hint?: string; // hướng dẫn định dạng cho AI
}

export interface VisaSection {
  id: string;
  title: string;
  titleVi: string;
  questions: VisaQuestion[];
}

export const VISA_SECTIONS: VisaSection[] = [
  {
    id: "personal",
    title: "Personal & contact details",
    titleVi: "Thông tin cá nhân & liên hệ",
    questions: [
      { id: "given_names", q: "Given names (as on passport)", vi: "Tên đệm + tên", hint: "Exactly as on passport, without diacritics if the passport has none" },
      { id: "family_name", q: "Family name (as on passport)", vi: "Họ" },
      { id: "other_names", q: "Have you ever been known by another name?", vi: "Tên khác / tên cũ", hint: "Answer 'No' only if the client explicitly said so" },
      { id: "sex", q: "Sex", vi: "Giới tính", hint: "Male / Female" },
      { id: "dob", q: "Date of birth", vi: "Ngày sinh", hint: "DD Month YYYY" },
      { id: "place_of_birth", q: "Place of birth (town/city)", vi: "Nơi sinh" },
      { id: "country_of_birth", q: "Country of birth", vi: "Quốc gia sinh" },
      { id: "nationality", q: "Country of nationality", vi: "Quốc tịch" },
      { id: "other_nationality", q: "Do you have, or have you ever had, any other nationality or citizenship?", vi: "Quốc tịch khác" },
      { id: "email", q: "Email address", vi: "Email" },
      { id: "phone", q: "Telephone number (with country code)", vi: "Số điện thoại", hint: "International format e.g. +420 ... only using digits the client gave" },
      { id: "home_address", q: "Home address (address line, town/city, postcode, country)", vi: "Địa chỉ nhà", hint: "Keep original street names; format: street + number, postcode city, country" },
      { id: "address_duration", q: "How long have you lived at this address?", vi: "Thời gian sống tại địa chỉ" },
      { id: "address_ownership", q: "What is the ownership status of your home?", vi: "Nhà sở hữu / thuê / khác", hint: "I own it / I rent it / Other (explain)" },
      { id: "correspondence_address", q: "Is your correspondence address the same as your home address?", vi: "Địa chỉ liên lạc có giống địa chỉ nhà không" },
    ],
  },
  {
    id: "passport",
    title: "Passport & residence permit",
    titleVi: "Hộ chiếu & thẻ cư trú",
    questions: [
      { id: "passport_number", q: "Passport or travel document number", vi: "Số hộ chiếu" },
      { id: "passport_authority", q: "Issuing authority / country", vi: "Cơ quan cấp", hint: "e.g. 'Ministry of Public Security, Vietnam' or the embassy that issued it" },
      { id: "passport_issue", q: "Issue date", vi: "Ngày cấp", hint: "DD Month YYYY" },
      { id: "passport_expiry", q: "Expiry date", vi: "Ngày hết hạn", hint: "DD Month YYYY" },
      { id: "national_id", q: "Do you have a valid national identity card?", vi: "CCCD / CMND (số, ngày cấp, ngày hết hạn)" },
      { id: "residence_country", q: "Country of residence (where you currently live)", vi: "Quốc gia đang cư trú" },
      { id: "residence_permit_type", q: "Residence permit type (e.g. permanent / long-term residence)", vi: "Loại thẻ cư trú (trvalý pobyt, dlouhodobý pobyt...)", hint: "Translate Czech terms: 'trvalý pobyt' = permanent residence; 'dlouhodobý pobyt' = long-term residence" },
      { id: "residence_permit_number", q: "Residence permit number", vi: "Số thẻ cư trú" },
      { id: "residence_permit_issue", q: "Residence permit issue date", vi: "Ngày cấp thẻ cư trú", hint: "DD Month YYYY" },
      { id: "residence_permit_expiry", q: "Residence permit expiry date", vi: "Ngày hết hạn thẻ cư trú", hint: "DD Month YYYY" },
    ],
  },
  {
    id: "family",
    title: "Relationship status & family",
    titleVi: "Tình trạng hôn nhân & gia đình",
    questions: [
      { id: "relationship_status", q: "What is your relationship status?", vi: "Tình trạng hôn nhân", hint: "Single / Married or civil partnership / Unmarried partner / Divorced / Separated / Widowed" },
      { id: "partner_details", q: "Partner's full name, date of birth and nationality", vi: "Họ tên, ngày sinh, quốc tịch vợ/chồng" },
      { id: "partner_passport", q: "Partner's passport number", vi: "Số hộ chiếu vợ/chồng" },
      { id: "partner_lives_with", q: "Does your partner live with you?", vi: "Vợ/chồng có sống cùng không" },
      { id: "partner_travelling", q: "Is your partner travelling with you to the UK?", vi: "Vợ/chồng có đi cùng không" },
      { id: "children", q: "Do you have any children? (name, date of birth, nationality, lives with you, travelling with you)", vi: "Con cái" },
      { id: "father", q: "Father's full name, date of birth and nationality", vi: "Bố: họ tên, ngày sinh, quốc tịch" },
      { id: "mother", q: "Mother's full name, date of birth and nationality", vi: "Mẹ: họ tên, ngày sinh, quốc tịch" },
      { id: "family_in_uk", q: "Do you have any family in the UK?", vi: "Người thân tại UK" },
    ],
  },
  {
    id: "work",
    title: "Employment, income & finances",
    titleVi: "Công việc & thu nhập / tài chính",
    questions: [
      { id: "employment_status", q: "What is your employment status?", vi: "Tình trạng việc làm", hint: "Employed / Self-employed / Student / Retired / Unemployed" },
      { id: "job_title", q: "Job title", vi: "Chức danh" },
      { id: "employer_name", q: "Employer or business name", vi: "Tên công ty / cơ sở kinh doanh" },
      { id: "employer_address", q: "Employer or business address", vi: "Địa chỉ công ty" },
      { id: "employer_phone", q: "Employer or business telephone number", vi: "SĐT công ty" },
      { id: "job_start_date", q: "When did you start working there?", vi: "Ngày bắt đầu làm", hint: "DD Month YYYY or Month YYYY if the day is unknown" },
      { id: "job_description", q: "Describe your job", vi: "Mô tả công việc", hint: "1-3 plain sentences based only on what the client said" },
      { id: "monthly_income", q: "How much do you earn each month after tax?", vi: "Thu nhập/tháng sau thuế", hint: "Keep the client's currency, e.g. 'CZK 45,000'. Do not convert." },
      { id: "other_income", q: "Do you have any other income or savings? (source and amount)", vi: "Thu nhập khác / tiết kiệm" },
      { id: "monthly_spending", q: "How much money do you spend each month? (rent, bills, family)", vi: "Chi tiêu hằng tháng" },
    ],
  },
  {
    id: "dates",
    title: "Planned travel dates & travel history",
    titleVi: "Ngày dự kiến đến – rời UK & lịch sử đi lại",
    questions: [
      { id: "arrival_date", q: "Date you will arrive in the UK", vi: "Ngày đến UK", hint: "DD Month YYYY" },
      { id: "departure_date", q: "Date you will leave the UK", vi: "Ngày rời UK", hint: "DD Month YYYY" },
      { id: "visit_reason", q: "What is the main reason for your visit?", vi: "Mục đích chính", hint: "e.g. Tourism (including visiting family and friends)" },
      { id: "visit_description", q: "Give details of your visit (what you will do)", vi: "Mô tả chuyến đi" },
      { id: "uk_history", q: "Have you been to the UK in the past 10 years? (dates and purpose)", vi: "Đã từng đến UK trong 10 năm" },
      { id: "world_history", q: "Have you visited any other countries in the past 10 years? (country, dates, purpose)", vi: "Các nước khác đã đi trong 10 năm", hint: "List each trip on its own line: Country – Month YYYY – purpose" },
      { id: "visa_refusals", q: "Have you ever been refused a visa or entry to any country?", vi: "Từng bị từ chối visa / nhập cảnh" },
    ],
  },
  {
    id: "trip",
    title: "Accommodation, itinerary & trip costs",
    titleVi: "Lịch trình lưu trú & chi phí chuyến đi",
    questions: [
      { id: "accommodation", q: "Where will you stay in the UK? (name and full address of hotel/host)", vi: "Nơi ở tại UK" },
      { id: "itinerary", q: "Itinerary – cities/places you plan to visit", vi: "Lịch trình" },
      { id: "travelling_with", q: "Are you travelling with anyone? (name, relationship)", vi: "Đi cùng ai" },
      { id: "organisation_group", q: "Are you travelling as part of an organised tour/group?", vi: "Đi theo tour / đoàn" },
      { id: "trip_cost", q: "How much will your visit cost? (in GBP if known)", vi: "Tổng chi phí chuyến đi", hint: "Use only amounts the client gave; keep their currency if not GBP and say so" },
      { id: "who_pays", q: "Who is paying for your visit?", vi: "Ai chi trả" },
      { id: "uk_contact", q: "Do you know anyone in the UK you will visit? (name, address, relationship)", vi: "Người quen tại UK" },
    ],
  },
];

export const ALL_QUESTIONS = VISA_SECTIONS.flatMap((s) => s.questions.map((q) => ({ ...q, section: s.id })));
