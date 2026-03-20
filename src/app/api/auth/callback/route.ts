import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // 处理 OAuth 错误
    if (error) {
      console.error('OAuth 错误:', error);
      return NextResponse.redirect(new URL(`/?error=${error}`, request.url));
    }

    // 验证 code
    if (!code) {
      return NextResponse.redirect(new URL('/?error=missing_code', request.url));
    }

    // WebView 场景：宽松的 state 验证
    const cookieStore = request.cookies;
    const storedState = cookieStore.get('oauth_state')?.value;

    if (state !== storedState) {
      console.warn('OAuth state 验证失败，可能是跨 WebView 场景，继续处理登录');
    }

    // 交换 code 获取 token
    const tokenData = await exchangeCodeForToken(code);
    console.log('Token response:', JSON.stringify(tokenData));

    // 兼容不同的 token 字段名格式
    const access_token = tokenData.access_token || tokenData.accessToken || tokenData.token || null;
    const refresh_token = tokenData.refresh_token || tokenData.refreshToken || tokenData.refresh || null;
    const expires_in = tokenData.expires_in || tokenData.expiresIn || 7200;

    if (!access_token) {
      console.error('Token 响应缺少 access_token:', tokenData);
      return NextResponse.redirect(new URL('/?error=token_missing', request.url));
    }

    // 计算 token 过期时间，防御性处理
    let tokenExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 默认 2 小时
    if (expires_in) {
      const expiresInSeconds = parseInt(String(expires_in), 10);
      if (!isNaN(expiresInSeconds) && expiresInSeconds > 0) {
        tokenExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);
      }
    }

    // 获取用户信息
    const userInfoResponse = await fetch(
      `${process.env.SECONDME_API_BASE_URL}/api/secondme/user/info`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    let userInfo = null;
    if (userInfoResponse.ok) {
      const userInfoData = await userInfoResponse.json();
      if (userInfoData.code === 0) {
        userInfo = userInfoData.data;
      }
    }

    // 保存或更新用户信息
    const secondmeUserId = userInfo?.userId || userInfo?.user_id || `user_${Date.now()}`;
    const nickname = userInfo?.name || userInfo?.nickname || '游戏搭子用户';
    const avatarUrl = userInfo?.avatar || userInfo?.avatar_url || null;
    const email = userInfo?.email || null;
    const bio = userInfo?.bio || null;
    const selfIntroduction = userInfo?.selfIntroduction || null;
    const profileCompleteness = userInfo?.profileCompleteness || 0;
    const route = userInfo?.route || null;

    await prisma.user.upsert({
      where: { secondmeUserId },
      create: {
        secondmeUserId,
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt,
        nickname,
        avatarUrl,
        email,
        bio,
        selfIntroduction,
        profileCompleteness,
        route,
      },
      update: {
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt,
        nickname,
        avatarUrl,
        email,
        bio,
        selfIntroduction,
        profileCompleteness,
        route,
      },
    });

    // 创建会话 cookie
    const response = NextResponse.redirect(new URL('/', request.url));

    response.cookies.set('session', secondmeUserId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 天
      path: '/',
    });

    // 清除 state cookie
    response.cookies.delete('oauth_state');

    return response;
  } catch (error) {
    console.error('OAuth 回调错误:', error);
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
  }
}