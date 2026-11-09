import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { computed, inject, Injectable, Pipe, PipeTransform, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';

export interface CatalogItem { id: number; name: string; category: string; }

export interface Offering {
  offeringId: number; providerId: number; providerName: string; phone: string; localities: string;
  serviceId: number; serviceName: string; category: string;
  regularPrice: number; discountedPrice: number | null; homeCollection: boolean; reportTatHours: number;
  effectiveFrom: string; sourceType: string; sourceNote: string | null; submittedAt: string; verifiedAt: string;
}

export interface HistoryEntry {
  regularPrice: number; discountedPrice: number | null; homeCollection: boolean; reportTatHours: number;
  effectiveFrom: string; sourceType: string; submittedAt: string; verifiedAt: string;
}

export interface Branch {
  name: string; address: string; locality: string; city: string; pincode: string; phone: string; workingHours: string;
}

export interface ProfileData {
  name: string; description: string; phone: string; email: string; website: string;
  licenseNumber: string; facilities: string; branches: Branch[];
}

export interface ProviderDetail {
  profile: { id: number; data: ProfileData; sourceType: string; submittedAt: string; verifiedAt: string };
  offerings: Offering[];
}

export interface Dashboard {
  providerId: number; published: boolean;
  latest: { data: ProfileData; status: Status; submittedAt: string; reviewedAt: string | null; reviewNote: string | null } | null;
}

export interface ProviderOffering {
  offeringId: number; serviceId: number; serviceName: string; category: string; active: boolean;
  publishedPrice: number | null; publishedDiscount: number | null; verifiedAt: string | null;
  latestPrice: number | null; latestDiscount: number | null; latestHomeCollection: boolean | null;
  latestTatHours: number | null; latestEffectiveFrom: string | null; latestStatus: Status | null; latestNote: string | null;
}

export interface OfferingRequest {
  catalogServiceId: number | null; regularPrice: number | null; discountedPrice: number | null;
  homeCollection: boolean; reportTatHours: number | null; effectiveFrom: string; sourceNote: string;
}

export interface PendingProfile {
  versionId: number; providerId: number; ownerEmail: string; data: ProfileData;
  publishedData: ProfileData | null; submittedAt: string;
}

export interface PendingOffering {
  versionId: number; providerName: string; ownerEmail: string; serviceName: string;
  regularPrice: number; discountedPrice: number | null; homeCollection: boolean; reportTatHours: number;
  effectiveFrom: string; sourceNote: string | null; submittedAt: string;
  publishedPrice: number | null; publishedDiscount: number | null;
}

export interface Queue { profiles: PendingProfile[]; offerings: PendingOffering[]; }

export interface Session { token: string; role: 'PROVIDER' | 'ADMIN'; email: string; }

export interface SearchFilters { q: string; location: string; home: boolean; max: number | null; sort: string; }

export interface LocationOption { label: string; type: 'CITY' | 'AREA' | 'PINCODE'; }

export interface BookableOffering {
  offeringId: number; serviceName: string; providerName: string; price: number;
  homeCollection: boolean; reportTatHours: number;
}

export interface BookingRequest {
  offeringId: number; patientName: string; phone: string; visitDate: string; consent: boolean;
}

export type BookingState = 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface BookingStatus {
  bookingNumber: string; serviceName: string; providerName: string; providerPhone: string; visitDate: string;
  token: number; status: BookingState; price: number; peopleAhead: number; estimatedWaitMinutes: number;
}

export interface QueueEntry {
  id: number; bookingNumber: string; token: number; patientName: string; patientPhone: string;
  serviceName: string; status: BookingState;
}

export interface LabQueue { minutesPerPatient: number; bookings: QueueEntry[]; }

const STORAGE_KEY = 'session';

@Injectable({ providedIn: 'root' })
export class Auth {
  readonly session = signal<Session | null>(readStored());
  readonly role = computed(() => this.session()?.role ?? null);
  readonly home = computed(() => (this.role() === 'ADMIN' ? '/admin' : '/provider'));

  set(session: Session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    this.session.set(session);
  }

  clear() {
    localStorage.removeItem(STORAGE_KEY);
    this.session.set(null);
  }
}

function readStored(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);

  meta() { return this.http.get<{ demoData: boolean }>('/api/public/meta'); }
  catalog(q = '') { return this.http.get<CatalogItem[]>('/api/public/catalog', { params: { q } }); }
  locations() { return this.http.get<LocationOption[]>('/api/public/locations'); }
  provider(id: number) { return this.http.get<ProviderDetail>(`/api/public/providers/${id}`); }
  history(id: number) { return this.http.get<HistoryEntry[]>(`/api/public/offerings/${id}/history`); }

  search(f: SearchFilters) {
    const params: Record<string, string> = { q: f.q, location: f.location, sort: f.sort };
    if (f.home) params['homeCollection'] = 'true';
    if (f.max != null) params['maxPrice'] = String(f.max);
    return this.http.get<Offering[]>('/api/public/search', { params });
  }

  login(email: string, password: string) { return this.http.post<Session>('/api/auth/login', { email, password }); }
  register(email: string, password: string) { return this.http.post<Session>('/api/auth/register-provider', { email, password }); }

  dashboard() { return this.http.get<Dashboard>('/api/provider/dashboard'); }
  submitProfile(data: ProfileData) { return this.http.put<void>('/api/provider/profile', data); }
  myOfferings() { return this.http.get<ProviderOffering[]>('/api/provider/offerings'); }
  submitOffering(body: OfferingRequest) { return this.http.post<void>('/api/provider/offerings', body); }
  setActive(id: number, active: boolean) { return this.http.patch<void>(`/api/provider/offerings/${id}/active`, { active }); }

  bookableOffering(id: number) { return this.http.get<BookableOffering>(`/api/public/offerings/${id}`); }
  createBooking(body: BookingRequest) { return this.http.post<BookingStatus>('/api/public/bookings', body); }
  lookupBooking(bookingNumber: string, phone: string) {
    return this.http.post<BookingStatus>('/api/public/bookings/lookup', { bookingNumber, phone });
  }
  labQueue(date: string) { return this.http.get<LabQueue>('/api/provider/bookings', { params: { date } }); }
  setBookingStatus(id: number, status: BookingState) { return this.http.patch<void>(`/api/provider/bookings/${id}/status`, { status }); }
  saveQueueSettings(minutesPerPatient: number) { return this.http.put<void>('/api/provider/queue-settings', { minutesPerPatient }); }

  queue() { return this.http.get<Queue>('/api/admin/queue'); }
  review(kind: 'profiles' | 'offerings', id: number, decision: 'APPROVE' | 'REJECT', note: string) {
    return this.http.post<void>(`/api/admin/${kind}/${id}/review`, { decision, note });
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const router = inject(Router);
  const privateCall = req.url.startsWith('/api/provider') || req.url.startsWith('/api/admin');
  const token = auth.session()?.token;
  const request = privateCall && token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(request).pipe(
    catchError((err: HttpErrorResponse) => {
      if (privateCall && err.status === 401) {
        auth.clear();
        router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};

export function roleGuard(role: Session['role']): CanActivateFn {
  return () => {
    const auth = inject(Auth);
    return auth.role() === role || inject(Router).createUrlTree(['/login']);
  };
}

export function errorText(err: unknown): string {
  const e = err as HttpErrorResponse;
  if (e?.status === 0) return 'Cannot reach the server. Check that the backend is running.';
  return e?.error?.message ?? 'Something went wrong. Please try again.';
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function emptyBranch(): Branch {
  return { name: 'Main branch', address: '', locality: '', city: 'Tirupati', pincode: '', phone: '', workingHours: '' };
}

@Pipe({ name: 'inr' })
export class InrPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return value == null ? '—' : '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }
}

@Pipe({ name: 'tat' })
export class TatPipe implements PipeTransform {
  transform(hours: number | null | undefined): string {
    if (hours == null) return '—';
    if (hours < 48) return `${hours} hr${hours === 1 ? '' : 's'}`;
    const days = Math.round(hours / 24);
    return `${days} days`;
  }
}

@Pipe({ name: 'source' })
export class SourcePipe implements PipeTransform {
  transform(type: string): string {
    return type === 'PROVIDER_DECLARED' ? 'Provider declared' : type === 'DEMO_DATA' ? 'Demo data, not a real price' : type;
  }
}
