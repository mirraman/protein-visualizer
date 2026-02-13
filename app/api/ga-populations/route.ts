import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import GAPopulation from '@/lib/models/GAPopulation';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/auth.config';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { searchParams } = new URL(request.url);
    const sequence = searchParams.get('sequence');
    const userId = searchParams.get('userId') || session.user.id;
    const generation = searchParams.get('generation');

    const query: any = {};
    if (sequence) query.sequence = sequence;
    if (userId) query.userId = userId;
    if (generation !== null && generation !== undefined) {
      query.generation = parseInt(generation);
    }

    const populations = await GAPopulation.find(query)
      .sort({ generation: 1 })
      .lean();

    return NextResponse.json({ data: populations });
  } catch (error) {
    console.error('Error fetching GA populations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch populations' },
      { status: 500 }
    );
  }
}
