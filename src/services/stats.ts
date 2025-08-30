import { User } from "@/db/models/auth.model";
import { Course } from "@/db/models/course.model";
import { Chapter } from "@/db/models/chapter.model";
import { Lesson } from "@/db/models/lesson.model";
import { Enrollment } from "@/db/models/enrollment.model";

export interface DashboardStats {
  users: {
    totalSignups: number;
    totalCustomers: number;
    newSignupsThisMonth: number;
    newCustomersThisMonth: number;
  };
  courses: {
    totalCourses: number;
    publishedCourses: number;
    draftCourses: number;
    archivedCourses: number;
    coursesCreatedThisMonth: number;
  };
  content: {
    totalChapters: number;
    totalLessons: number;
    lessonsInPublishedCourses: number;
    lessonsInOtherCourses: number;
    chaptersInPublishedCourses: number;
    chaptersInOtherCourses: number;
  };
  enrollments: {
    totalEnrollments: number;
    activeEnrollments: number;
    completedEnrollments: number;
    pendingEnrollments: number;
    cancelledEnrollments: number;
    enrollmentsThisMonth: number;
    totalRevenue: number;
    revenueThisMonth: number;
  };
  engagement: {
    averageProgressPerUser: number;
    mostPopularCourse: {
      title: string;
      enrollmentCount: number;
    } | null;
    completionRate: number;
  };
}

export class StatsService {
  /**
   * Get comprehensive dashboard statistics
   */
  static async getDashboardStats(): Promise<DashboardStats> {
    try {
      // Get current month date range
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      // Run all stat queries in parallel for better performance
      const [
        userStats,
        courseStats,
        contentStats,
        enrollmentStats,
        engagementStats,
      ] = await Promise.all([
        this.getUserStats(startOfMonth, endOfMonth),
        this.getCourseStats(startOfMonth, endOfMonth),
        this.getContentStats(),
        this.getEnrollmentStats(startOfMonth, endOfMonth),
        this.getEngagementStats(),
      ]);

      return {
        users: userStats,
        courses: courseStats,
        content: contentStats,
        enrollments: enrollmentStats,
        engagement: engagementStats,
      };
    } catch (error) {
      console.error("Error getting dashboard stats:", error);
      throw new Error("Failed to fetch dashboard statistics");
    }
  }

  /**
   * Get user-related statistics
   */
  private static async getUserStats(
    startOfMonth: Date,
    endOfMonth: Date
  ): Promise<DashboardStats["users"]> {
    // Total signups (all users)
    const totalSignups = await User.countDocuments();

    // Total customers (users with at least one enrollment)
    const customersAggregation = await User.aggregate([
      {
        $lookup: {
          from: "enrollments",
          localField: "_id",
          foreignField: "user",
          as: "enrollments",
        },
      },
      {
        $match: {
          "enrollments.0": { $exists: true }, // Has at least one enrollment
        },
      },
      {
        $count: "totalCustomers",
      },
    ]);

    const totalCustomers = customersAggregation[0]?.totalCustomers || 0;

    // New signups this month
    const newSignupsThisMonth = await User.countDocuments({
      createdAt: {
        $gte: startOfMonth,
        $lte: endOfMonth,
      },
    });

    // New customers this month (users who made their first enrollment this month)
    const newCustomersAggregation = await User.aggregate([
      {
        $lookup: {
          from: "enrollments",
          localField: "_id",
          foreignField: "user",
          as: "enrollments",
        },
      },
      {
        $match: {
          "enrollments.0": { $exists: true },
        },
      },
      {
        $addFields: {
          firstEnrollment: { $min: "$enrollments.createdAt" },
        },
      },
      {
        $match: {
          firstEnrollment: {
            $gte: startOfMonth,
            $lte: endOfMonth,
          },
        },
      },
      {
        $count: "newCustomers",
      },
    ]);

    const newCustomersThisMonth = newCustomersAggregation[0]?.newCustomers || 0;

    return {
      totalSignups,
      totalCustomers,
      newSignupsThisMonth,
      newCustomersThisMonth,
    };
  }

  /**
   * Get course-related statistics
   */
  private static async getCourseStats(
    startOfMonth: Date,
    endOfMonth: Date
  ): Promise<DashboardStats["courses"]> {
    // Course counts by status
    const courseStatusCounts = await Course.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const statusMap = courseStatusCounts.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {} as Record<string, number>);

    const totalCourses = await Course.countDocuments();
    const publishedCourses = statusMap["Published"] || 0;
    const draftCourses = statusMap["Draft"] || 0;
    const archivedCourses = statusMap["Archived"] || 0;

    // Courses created this month
    const coursesCreatedThisMonth = await Course.countDocuments({
      createdAt: {
        $gte: startOfMonth,
        $lte: endOfMonth,
      },
    });

    return {
      totalCourses,
      publishedCourses,
      draftCourses,
      archivedCourses,
      coursesCreatedThisMonth,
    };
  }

  /**
   * Get content-related statistics (chapters and lessons)
   */
  private static async getContentStats(): Promise<DashboardStats["content"]> {
    // Total chapters and lessons
    const [totalChapters, totalLessons] = await Promise.all([
      Chapter.countDocuments(),
      Lesson.countDocuments(),
    ]);

    // Get published course IDs
    const publishedCourses = await Course.find(
      { status: "Published" },
      { _id: 1 }
    );
    const publishedCourseIds = publishedCourses.map((course) => course._id);

    // Chapters in published vs other courses
    const [chaptersInPublishedCourses, chaptersInOtherCourses] =
      await Promise.all([
        Chapter.countDocuments({ course: { $in: publishedCourseIds } }),
        Chapter.countDocuments({ course: { $nin: publishedCourseIds } }),
      ]);

    // Get chapter IDs for published and other courses
    const [publishedChapters, otherChapters] = await Promise.all([
      Chapter.find({ course: { $in: publishedCourseIds } }, { _id: 1 }),
      Chapter.find({ course: { $nin: publishedCourseIds } }, { _id: 1 }),
    ]);

    const publishedChapterIds = publishedChapters.map((chapter) => chapter._id);
    const otherChapterIds = otherChapters.map((chapter) => chapter._id);

    // Lessons in published vs other courses
    const [lessonsInPublishedCourses, lessonsInOtherCourses] =
      await Promise.all([
        Lesson.countDocuments({ chapter: { $in: publishedChapterIds } }),
        Lesson.countDocuments({ chapter: { $in: otherChapterIds } }),
      ]);

    return {
      totalChapters,
      totalLessons,
      lessonsInPublishedCourses,
      lessonsInOtherCourses,
      chaptersInPublishedCourses,
      chaptersInOtherCourses,
    };
  }

  /**
   * Get enrollment-related statistics
   */
  private static async getEnrollmentStats(
    startOfMonth: Date,
    endOfMonth: Date
  ): Promise<DashboardStats["enrollments"]> {
    // Enrollment counts by status
    const enrollmentStatusCounts = await Enrollment.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    const statusMap = enrollmentStatusCounts.reduce((acc, item) => {
      acc[item._id] = { count: item.count, revenue: item.totalAmount };
      return acc;
    }, {} as Record<string, { count: number; revenue: number }>);

    const totalEnrollments = await Enrollment.countDocuments();
    const activeEnrollments = statusMap["active"]?.count || 0;
    const completedEnrollments = statusMap["completed"]?.count || 0;
    const pendingEnrollments = statusMap["pending"]?.count || 0;
    const cancelledEnrollments = statusMap["cancelled"]?.count || 0;

    // Total revenue (from active and completed enrollments)
    const totalRevenue =
      (statusMap["active"]?.revenue || 0) +
      (statusMap["completed"]?.revenue || 0);

    // Enrollments this month
    const enrollmentsThisMonth = await Enrollment.countDocuments({
      createdAt: {
        $gte: startOfMonth,
        $lte: endOfMonth,
      },
    });

    // Revenue this month
    const revenueThisMonthResult = await Enrollment.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startOfMonth,
            $lte: endOfMonth,
          },
          status: { $in: ["active", "completed"] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    const revenueThisMonth = revenueThisMonthResult[0]?.total || 0;

    return {
      totalEnrollments,
      activeEnrollments,
      completedEnrollments,
      pendingEnrollments,
      cancelledEnrollments,
      enrollmentsThisMonth,
      totalRevenue,
      revenueThisMonth,
    };
  }

  /**
   * Get engagement-related statistics
   */
  private static async getEngagementStats(): Promise<
    DashboardStats["engagement"]
  > {
    // Average progress per user
    const averageProgressResult = await Enrollment.aggregate([
      {
        $match: {
          status: { $in: ["active", "completed"] },
        },
      },
      {
        $group: {
          _id: null,
          averageProgress: { $avg: "$progress" },
        },
      },
    ]);

    const averageProgressPerUser =
      averageProgressResult[0]?.averageProgress || 0;

    // Most popular course (by enrollment count)
    const mostPopularCourseResult = await Enrollment.aggregate([
      {
        $group: {
          _id: "$course",
          enrollmentCount: { $sum: 1 },
        },
      },
      {
        $sort: { enrollmentCount: -1 },
      },
      {
        $limit: 1,
      },
      {
        $lookup: {
          from: "courses",
          localField: "_id",
          foreignField: "_id",
          as: "courseInfo",
        },
      },
      {
        $unwind: "$courseInfo",
      },
      {
        $project: {
          title: "$courseInfo.title",
          enrollmentCount: 1,
        },
      },
    ]);

    const mostPopularCourse = mostPopularCourseResult[0] || null;

    // Completion rate (completed enrollments / total enrollments)
    const completedCount = await Enrollment.countDocuments({
      status: "completed",
    });
    const totalActiveEnrollments = await Enrollment.countDocuments({
      status: { $in: ["active", "completed"] },
    });

    const completionRate =
      totalActiveEnrollments > 0
        ? (completedCount / totalActiveEnrollments) * 100
        : 0;

    return {
      averageProgressPerUser: Math.round(averageProgressPerUser * 100) / 100,
      mostPopularCourse,
      completionRate: Math.round(completionRate * 100) / 100,
    };
  }

  /**
   * Get stats for a specific time period
   */
  static async getStatsForPeriod(
    startDate: Date,
    endDate: Date
  ): Promise<Partial<DashboardStats>> {
    try {
      const [userStats, courseStats, enrollmentStats] = await Promise.all([
        this.getUserStats(startDate, endDate),
        this.getCourseStats(startDate, endDate),
        this.getEnrollmentStats(startDate, endDate),
      ]);

      return {
        users: userStats,
        courses: courseStats,
        enrollments: enrollmentStats,
      };
    } catch (error) {
      console.error("Error getting period stats:", error);
      throw new Error("Failed to fetch period statistics");
    }
  }

  /**
   * Get quick overview stats (for dashboard cards)
   */
  static async getQuickStats(): Promise<{
    totalUsers: number;
    totalCustomers: number;
    totalCourses: number;
    totalRevenue: number;
  }> {
    try {
      const [totalUsers, totalCourses] = await Promise.all([
        User.countDocuments(),
        Course.countDocuments(),
      ]);

      // Total customers
      const customersResult = await User.aggregate([
        {
          $lookup: {
            from: "enrollments",
            localField: "_id",
            foreignField: "user",
            as: "enrollments",
          },
        },
        {
          $match: {
            "enrollments.0": { $exists: true },
          },
        },
        {
          $count: "totalCustomers",
        },
      ]);

      const totalCustomers = customersResult[0]?.totalCustomers || 0;

      // Total revenue
      const revenueResult = await Enrollment.aggregate([
        {
          $match: {
            status: { $in: ["active", "completed"] },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ]);

      const totalRevenue = revenueResult[0]?.total || 0;

      return {
        totalUsers,
        totalCustomers,
        totalCourses,
        totalRevenue,
      };
    } catch (error) {
      console.error("Error getting quick stats:", error);
      throw new Error("Failed to fetch quick statistics");
    }
  }
}
