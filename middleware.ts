import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/reserve') {
    const url = request.nextUrl.clone();
    url.pathname = '/reserve-new';
    return NextResponse.rewrite(url);
  }

  if (request.nextUrl.pathname === '/my-reservations') {
    const url = request.nextUrl.clone();
    url.pathname = '/my-reservations-new';
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/reserve', '/my-reservations']
};
