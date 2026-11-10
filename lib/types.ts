export interface FlightOption {
  price: number; // tổng giá (khứ hồi nếu là truy vấn khứ hồi)
  airlines: string[];
  depTime: string; // "HH:mm"
  arrTime: string; // "HH:mm"
  arrDayOffset: number; // +1 nếu hạ cánh hôm sau
  durationMin: number;
  stops: number;
  layovers: string[]; // "1 hr 5 min @ Zurich Airport"
  fromAirport: string;
  toAirport: string;
  note?: string; // ví dụ "giá chưa gồm hành lý xách tay"
}

export interface FlightsApiResponse {
  ok: boolean;
  code?: "RATE_LIMITED" | "CONSENT" | "PARSE_EMPTY" | "HTTP_ERROR" | "BAD_REQUEST" | "NETWORK";
  message?: string;
  url: string; // link Google Flights (tiếng Việt) để mở cho người dùng
  outbound: FlightOption[];
  inbound?: FlightOption[]; // chuyến về tham khảo (truy vấn một chiều)
}
