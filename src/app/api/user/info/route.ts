import { NextRequest, NextResponse } from 'next/server';
import { refreshAccessToken } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// 获取当前用户信息
export async function GET(request: NextRequest) {
  try {
    const session = request.cookies.get('session')?.value;

    if (!session) {
      return NextResponse.json(
        { code: 401, message: '未登录', data: null },
        { status: 401 }
      );
    }

    // 从数据库获取用户
    const user = await prisma.user.findUnique({
      where: { secondmeUserId: session },
    });

    if (!user) {
      return NextResponse.json(
        { code: 404, message: '用户不存在', data: null },
        { status: 404 }
      );
    }

    // 检查 token 是否过期
    if (new Date() >= user.tokenExpiresAt) {
      try {
        const tokenData = await refreshAccessToken(user.refreshToken);

        const { access_token, refresh_token, expires_in } = tokenData;
        const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

        // 更新用户 token
        await prisma.user.update({
          where: { id: user.id },
          data: {
            accessToken: access_token,
            refreshToken: refresh_token,
            tokenExpiresAt,
          },
        });

        user.accessToken = access_token;
      } catch (refreshError) {
        console.error('Token 刷新失败:', refreshError);
        return NextResponse.json(
          { code: 401, message: '登录已过期，请重新登录', data: null },
          { status: 401 }
        );
      }
    }

    // 从 SecondMe 获取用户信息
    const apiBaseUrl = process.env.SECONDME_API_BASE_URL!;
    const response = await fetch(`${apiBaseUrl}/api/secondme/user/info`, {
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { code: 500, message: '获取用户信息失败', data: null },
        { status: 500 }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error('获取用户信息错误:', error);
    return NextResponse.json(
      { code: 500, message: '服务器错误', data: null },
      { status: 500 }
    );
  }
}